import { createSign } from "node:crypto";
import { buildDriverSyncPreview } from "../server/driver-sync-preview.logic.js";

const FIRESTORE = (project) => `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;

function decodeValue(value) {
  if (!value || typeof value !== "object") return null;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return value.booleanValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(decodeValue);
  if ("mapValue" in value) return decodeFields(value.mapValue.fields || {});
  return null;
}
function decodeFields(fields) { return Object.fromEntries(Object.entries(fields || {}).map(([key, value]) => [key, decodeValue(value)])); }
function readAccount(envName) {
  const raw = process.env[envName];
  if (!raw) throw new Error(envName + " is not configured.");
  const text = raw.trim();
  for (const candidate of [text, Buffer.from(text.replace(/-/g,"+").replace(/_/g,"/"), "base64").toString("utf8").trim()]) {
    try {
      const account = JSON.parse(candidate);
      if (account.client_email && account.private_key) return account;
    } catch {}
  }
  throw new Error(envName + " is invalid.");
}
function b64url(value) { return Buffer.from(value).toString("base64url"); }
async function getToken(account) {
  const now = Math.floor(Date.now()/1000);
  const unsigned = b64url(JSON.stringify({alg:"RS256",typ:"JWT"})) + "." + b64url(JSON.stringify({iss:account.client_email,sub:account.client_email,aud:"https://oauth2.googleapis.com/token",scope:"https://www.googleapis.com/auth/datastore",iat:now,exp:now+3600}));
  const signer = createSign("RSA-SHA256"); signer.update(unsigned); signer.end();
  const assertion = unsigned + "." + signer.sign(account.private_key,"base64url");
  const response = await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion})});
  if (!response.ok) throw new Error("Firebase authentication failed.");
  return (await response.json()).access_token;
}
async function listCollection(token, project, collection) {
  const rows=[]; let pageToken="";
  do {
    const url=FIRESTORE(project)+"/"+collection+"?pageSize=1000"+(pageToken?"&pageToken="+encodeURIComponent(pageToken):"");
    const response=await fetch(url,{headers:{Authorization:"Bearer "+token}});
    if(response.status===404) return rows;
    if(!response.ok) throw new Error("Unable to read "+project+"/"+collection+".");
    const body=await response.json();
    for(const doc of body.documents||[]) rows.push({_docId:doc.name.split("/").pop(),...decodeFields(doc.fields)});
    pageToken=body.nextPageToken||"";
  } while(pageToken);
  return rows;
}
async function verifyUser(idToken) {
  const key=process.env.FIREBASE_WEB_API_KEY;
  if(!key) throw new Error("Ops Firebase web API key is not configured.");
  const response=await fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key="+key,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({idToken})});
  if(!response.ok) return null;
  const body=await response.json();
  return body.users?.[0]?.email?.trim().toLowerCase() || null;
}
export default async function handler(req,res) {
  if(req.method!=="GET") return res.status(405).json({error:"Method not allowed"});
  try {
    const token=String(req.headers.authorization||"").replace(/^Bearer\\s+/i,"");
    const email=await verifyUser(token);
    if(!email) return res.status(401).json({error:"Sign in to Ops before viewing the driver sync preview."});
    if(email!=="bc@swanstravel.com") return res.status(403).json({error:"Only the authorised Ops lead can view this preview."});
    const opsAccount=readAccount("FIREBASE_SERVICE_ACCOUNT_JSON_BASE64");
    const gateAccount=readAccount("GATECHECK_FIREBASE_SERVICE_ACCOUNT_JSON_BASE64");
    const [opsToken,gateToken]=await Promise.all([getToken(opsAccount),getToken(gateAccount)]);
    const [opsDrivers,opsCompliance,gateDrivers]=await Promise.all([
      listCollection(opsToken,"swans-ops-command-centre","ops_drivers"),
      listCollection(opsToken,"swans-ops-command-centre","ops_driver_compliance"),
      listCollection(gateToken,"swans-gate-check","drivers")
    ]);
    const preview=buildDriverSyncPreview(opsDrivers,opsCompliance,gateDrivers);
    return res.status(200).json({ok:true,...preview});
  } catch(error) {
    console.error("[driver-sync-preview]",error instanceof Error?error.message:"Unknown error");
    return res.status(502).json({error:error instanceof Error?error.message:"Unable to build driver sync preview."});
  }
}
