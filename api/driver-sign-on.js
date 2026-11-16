import { SignJWT, importPKCS8, createRemoteJWKSet, jwtVerify } from "jose";
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(scryptCallback);
const projectId = "swans-ops-command-centre";
const base = "https://firestore.googleapis.com/v1/projects/" + projectId + "/databases/(default)/documents";
const secureTokenKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));
const depots = ["travelmaster", "alderly-park", "swans", "cheltenham"];
const decodeValue = value => value.stringValue ?? (value.integerValue !== undefined ? Number(value.integerValue) : value.doubleValue !== undefined ? Number(value.doubleValue) : value.booleanValue !== undefined ? value.booleanValue : value.arrayValue ? (value.arrayValue.values || []).map(decodeValue) : value.mapValue ? decode(value.mapValue.fields) : null);
const decode = fields => Object.fromEntries(Object.entries(fields || {}).map(([key,value]) => [key, decodeValue(value)]));
const familiarisationSectionIds = ["driving-position", "mirrors-visibility", "doors-access", "passenger-safety", "emergency-equipment", "accessibility-equipment", "vehicle-equipment", "defect-procedure"];
const familiarisationAnswerIds = ["seat-adjustment","mirrors","lighting","dashboard","retarder","height","demisters","wipers","warning-response","passenger-doors","steps","lift-ramp","wheelchair-restraints","heating-passenger","pa-microphone","luggage","seating","exit-locations","exit-operation","hammers","fire-extinguisher","first-aid","evacuation","walkaround","tyres","defect-decision","tachograph","isolators","breakdown-kit","report-defects","breakdown","smell-smoke"];
const vipFamiliarisationAnswerIds = ["vip-tv-power","vip-tv-input","vip-tv-device","vip-tv-audio","vip-oven","vip-microwave","vip-kitchen-appliances","vip-kitchen-power","vip-hot-equipment","vip-kitchen-smoke"];
async function tokenFor(sa) { const key = await importPKCS8(sa.private_key, "RS256"); const jwt = await new SignJWT({scope:"https://www.googleapis.com/auth/datastore"}).setProtectedHeader({alg:"RS256",typ:"JWT"}).setIssuer(sa.client_email).setSubject(sa.client_email).setAudience("https://oauth2.googleapis.com/token").setIssuedAt().setExpirationTime("1h").sign(key); const r = await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:jwt})}); if(!r.ok) throw new Error("Firebase service authentication failed."); return (await r.json()).access_token; }
async function readDoc(token, path) { const r=await fetch(base+"/"+path,{headers:{Authorization:"Bearer "+token}}); if(r.status===404) return null; if(!r.ok) throw new Error("Could not verify depot or driver."); const d=await r.json(); return decode(d.fields); }
async function updateCredential(token, path, fields) { const mask=Object.keys(fields).map(key=>"updateMask.fieldPaths="+encodeURIComponent(key)).join("&"); const r=await fetch(base+"/"+path+"?"+mask,{method:"PATCH",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({fields})}); if(!r.ok) throw new Error("Could not update sign-on PIN protection."); }
function distance(a,b,c,d) { const rad=x=>x*Math.PI/180, p=rad(c-a), q=rad(d-b), h=Math.sin(p/2)**2+Math.cos(rad(a))*Math.cos(rad(c))*Math.sin(q/2)**2; return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h)); }

async function requireManager(req, serviceToken) {
 const authorization = req.headers.authorization || "";
 if (!authorization.startsWith("Bearer ")) return null;
 const verified = await jwtVerify(authorization.slice(7), secureTokenKeys, { audience: projectId, issuer: "https://securetoken.google.com/" + projectId });
 const uid = verified.payload.sub;
 if (typeof uid !== "string" || !uid) return null;
 const member = await readDoc(serviceToken, "ops_members/" + encodeURIComponent(uid));
 return member?.status === "active" && (["lead", "manager"].includes(member.memberRole) || (member.memberRole === "depot_supervisor" && member.depotSlug === "cheltenham")) ? member : null;
}
async function saveCredential(token, path, fields, exists) {
 const endpoint = exists
   ? base + "/" + path + "?" + Object.keys(fields).map(key => "updateMask.fieldPaths=" + encodeURIComponent(key)).join("&")
   : base + "/ops_driver_credentials?documentId=" + encodeURIComponent(path.split("/").at(-1));
 const response = await fetch(endpoint, { method: exists ? "PATCH" : "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ fields }) });
 if (!response.ok) throw new Error("The driver PIN could not be saved.");
}
async function issueDriverPin(req, res, driverId, pin) {
 if (typeof driverId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(driverId)) return res.status(400).json({ error: "Select a valid driver." });
 if (typeof pin !== "string" || !/^\d{8}$/.test(pin)) return res.status(400).json({ error: "Enter the driver's date of birth as DDMMYYYY." });
 const day = Number(pin.slice(0, 2)), month = Number(pin.slice(2, 4)), year = Number(pin.slice(4));
 const birthDate = new Date(Date.UTC(year, month - 1, day));
 if (year < 1900 || year > new Date().getUTCFullYear() || birthDate.getUTCDate() !== day || birthDate.getUTCMonth() !== month - 1 || birthDate.getUTCFullYear() !== year) return res.status(400).json({ error: "Enter a real date of birth in DDMMYYYY format." });
 let serviceAccount;
 try { serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 || "", "base64").toString("utf8")); } catch {}
 if (!serviceAccount) return res.status(503).json({ error: "Secure PIN issuing is not configured. Please tell the system administrator." });
 try {
   const serviceToken = await tokenFor(serviceAccount);
   let manager;
   try { manager = await requireManager(req, serviceToken); } catch { return res.status(401).json({ error: "Please sign in again with an operations manager account." }); }
   if (!manager) return res.status(403).json({ error: "Only authorised depot managers can issue this driver PIN." });
   const driver = await readDoc(serviceToken, "ops_drivers/" + encodeURIComponent(driverId));
   if (!driver || driver.active !== true) return res.status(404).json({ error: "This driver is not on the active driver list." });
   if (manager.memberRole === "depot_supervisor" && driver.depot !== "cheltenham") return res.status(403).json({ error: "You can only reset PINs for Cheltenham drivers." });
   const salt = randomBytes(16).toString("hex");
   const hash = await scrypt(pin, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
   const path = "ops_driver_credentials/" + encodeURIComponent(driverId);
   const existing = await readDoc(serviceToken, path);
   await saveCredential(serviceToken, path, {
     driverId: { stringValue: driverId },
     pinSalt: { stringValue: salt },
     pinHash: { stringValue: Buffer.from(hash).toString("hex") },
     failedAttempts: { integerValue: "0" },
     lockedUntil: { integerValue: "0" },
     updatedAt: { integerValue: String(Date.now()) },
     updatedBy: { stringValue: manager.displayName || "Operations manager" },
   }, existing !== null);
   return res.status(200).json({ ok: true, pin });
 } catch {
   return res.status(502).json({ error: "The driver PIN could not be issued. Please try again." });
 }
}
async function listFamiliarisationDrivers(res) {
 let serviceAccount;
 try { serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 || "", "base64").toString("utf8")); } catch {}
 if (!serviceAccount) return res.status(503).json({ error: "The driver list is not available right now." });
 try {
   const token = await tokenFor(serviceAccount);
   const drivers = [];
   let nextPageToken = "";
   do {
     const query = nextPageToken ? "?pageSize=1000&pageToken=" + encodeURIComponent(nextPageToken) : "?pageSize=1000";
     const response = await fetch(base + "/ops_drivers" + query, { headers: { Authorization: "Bearer " + token } });
     if (!response.ok) throw new Error("Could not load the active driver list.");
     const result = await response.json();
     for (const document of result.documents || []) {
       const driver = decode(document.fields);
       if (driver.active !== false && typeof driver.name === "string" && driver.name.trim()) {
         const id = document.name.split("/").at(-1);
         if (id) drivers.push({ id, name: driver.name });
       }
     }
     nextPageToken = result.nextPageToken || "";
   } while (nextPageToken);
   drivers.sort((a, b) => a.name.localeCompare(b.name));
   return res.status(200).json({ drivers });
 } catch {
   return res.status(502).json({ error: "The driver list could not be loaded. Please try again." });
 }
}

async function submitFamiliarisation(req, res, body) {
 const { driverId, pin, vehicleTypeId, vehicleRegistration, sectionIds, notes, answers, trainerName } = body;
 if (typeof driverId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(driverId)) return res.status(400).json({ error: "Select your name from the driver list." });
 if (typeof vehicleTypeId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(vehicleTypeId)) return res.status(400).json({ error: "Select a vehicle type." });
 if (typeof vehicleRegistration !== "string" || vehicleRegistration.trim().length < 2 || vehicleRegistration.trim().length > 20) return res.status(400).json({ error: "Select the vehicle registration." });
 if (!Array.isArray(sectionIds) || sectionIds.length !== familiarisationSectionIds.length || new Set(sectionIds).size !== familiarisationSectionIds.length || !familiarisationSectionIds.every(id => sectionIds.includes(id))) return res.status(400).json({ error: "Confirm all vehicle familiarisation sections before submitting." });
 if (typeof notes !== "string" || notes.length > 500) return res.status(400).json({ error: "Notes must be 500 characters or fewer." });
 if (typeof trainerName !== "string" || !trainerName.trim() || trainerName.trim().length > 100) return res.status(400).json({ error: "Enter the name of the person delivering the familiarisation." });
 if (!answers || typeof answers !== "object" || Array.isArray(answers)) return res.status(400).json({ error: "Confirm each familiarisation statement." });
 if (typeof pin !== "string" || !/^\d{8}$/.test(pin)) return res.status(400).json({ error: "Enter your 8-digit driver sign-on PIN." });
 let serviceAccount;
 try { serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 || "", "base64").toString("utf8")); } catch {}
 if (!serviceAccount) return res.status(503).json({ error: "Secure PIN verification is not configured. Please tell your depot team." });
 try {
   const token = await tokenFor(serviceAccount);
   const [driver, vehicleType] = await Promise.all([
     readDoc(token, "ops_drivers/" + encodeURIComponent(driverId)),
     readDoc(token, "ops_vehicle_familiarisation_vehicles/" + encodeURIComponent(vehicleTypeId))
   ]);
   if (!driver || driver.active === false) return res.status(403).json({ error: "This driver is not on the active driver list." });
   if (!vehicleType || typeof vehicleType.vehicleType !== "string" || !Array.isArray(vehicleType.registrations) || !vehicleType.registrations.includes(vehicleRegistration.trim().toUpperCase())) return res.status(400).json({ error: "That registration is not listed under the selected vehicle type. Ask your depot team to update the vehicle list." });
   const requiredAnswers = vehicleType.vehicleType.toLowerCase().includes("vip") ? [...familiarisationAnswerIds, ...vipFamiliarisationAnswerIds] : familiarisationAnswerIds;
   if (requiredAnswers.some(id => answers[id] !== "yes") || Object.keys(answers).some(id => !requiredAnswers.includes(id))) return res.status(400).json({ error: "All required statements must be confirmed after familiarisation and demonstration." });
   const credentialPath = "ops_driver_credentials/" + encodeURIComponent(driverId);
   const credential = await readDoc(token, credentialPath);
   if (!credential || typeof credential.pinSalt !== "string" || typeof credential.pinHash !== "string") return res.status(403).json({ error: "A sign-on PIN has not been issued for this driver. Please ask depot management." });
   const now = Date.now(), lockedUntil = Number(credential.lockedUntil || 0);
   if (lockedUntil > now) return res.status(429).json({ error: "PIN attempts are temporarily locked. Please ask depot management for help." });
   const supplied = Buffer.from(await scrypt(pin, credential.pinSalt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }));
   const expected = Buffer.from(credential.pinHash, "hex");
   if (expected.length !== supplied.length || !timingSafeEqual(supplied, expected)) {
     const attempts = Number(credential.failedAttempts || 0) + 1, lock = attempts >= 5 ? now + 15 * 60 * 1000 : 0;
     await updateCredential(token, credentialPath, { failedAttempts: { integerValue: String(lock ? 0 : attempts) }, lockedUntil: { integerValue: String(lock) } });
     return res.status(lock ? 429 : 403).json({ error: lock ? "Too many incorrect PIN attempts. Ask depot management to reset the PIN." : "That PIN does not match the selected driver." });
   }
   if (Number(credential.failedAttempts || 0) !== 0 || lockedUntil !== 0) await updateCredential(token, credentialPath, { failedAttempts: { integerValue: "0" }, lockedUntil: { integerValue: "0" } });
   const familiarisationDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
   const fields = {
     driverId: { stringValue: driverId },
     driverName: { stringValue: driver.name },
     depotSlug: { stringValue: typeof driver.depot === "string" ? driver.depot : "" },
     vehicleTypeId: { stringValue: vehicleTypeId },
     vehicleType: { stringValue: vehicleType.vehicleType },
     vehicleRegistration: { stringValue: vehicleRegistration.trim().toUpperCase() },
     familiarisationDate: { stringValue: familiarisationDate },
     sectionIds: { arrayValue: { values: familiarisationSectionIds.map(id => ({ stringValue: id })) } },
     answers: { mapValue: { fields: Object.fromEntries(Object.entries(answers).map(([id, value]) => [id, { stringValue: value }])) } },
     trainerName: { stringValue: trainerName.trim() },
     notes: { stringValue: notes.trim() },
     source: { stringValue: "driver-familiarisation-link" },
     pinVerified: { booleanValue: true },
     createdAt: { integerValue: String(Date.now()) },
     updatedAt: { integerValue: String(Date.now()) }
   };
   const saved = await fetch(base + "/ops_vehicle_familiarisations", { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ fields }) });
   if (!saved.ok) throw new Error("The familiarisation record could not be saved.");
   return res.status(200).json({ ok: true });
 } catch (error) {
   return res.status(502).json({ error: error instanceof Error ? error.message : "Vehicle familiarisation could not be saved." });
 }
}

export default async function handler(req,res) {
 if(req.method!=="POST") return res.status(405).json({error:"Method not allowed"});
 const body=typeof req.body==="string"?JSON.parse(req.body):req.body||{};
 if (body.action === "list-familiarisation-drivers") return listFamiliarisationDrivers(res);
 if (body.action === "issue-pin") return issueDriverPin(req, res, body.driverId, body.pin);
 if (body.action === "submit-familiarisation") return submitFamiliarisation(req, res, body);
 if (body.action !== undefined) return res.status(400).json({error:"Invalid sign-on action."});
 const {driverId,depotSlug,pin,deviceId,latitude,longitude,accuracy,positionTimestamp}=body;
 if(typeof driverId!=="string"||!/^[A-Za-z0-9_-]{1,128}$/.test(driverId)||!depots.includes(depotSlug)) return res.status(400).json({error:"A valid driver and depot are required."});
 if(typeof pin!=="string"||!/^\d{8}$/.test(pin)) return res.status(400).json({error:"Enter your personal 8-digit sign-on PIN."});
 if(typeof deviceId!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(deviceId)) return res.status(400).json({error:"This browser could not be recognised. Refresh the page and try again."});
 if(![latitude,longitude,accuracy,positionTimestamp].every(x=>typeof x==="number"&&Number.isFinite(x))||latitude < -90||latitude>90||longitude < -180||longitude>180||accuracy<=0||accuracy>50) return res.status(403).json({error:"A clear, accurate GPS location is required. Move outside and try again."});
 if(Math.abs(Date.now()-positionTimestamp)>30000) return res.status(403).json({error:"Your GPS reading has expired. Please try again."});
 let sa; try { sa=JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64||"","base64").toString("utf8")); } catch {} if(!sa) return res.status(503).json({error:"Secure sign-on is not configured. Please tell the depot team."});
 try { const token=await tokenFor(sa); const [driver,geo]=await Promise.all([readDoc(token,"ops_drivers/"+encodeURIComponent(driverId)),readDoc(token,"ops_depot_geofences/"+depotSlug)]);
 if(!driver||driver.active!==true||driver.depot!==depotSlug) return res.status(403).json({error:"This driver is not active or assigned to this depot."});
 const credentialPath="ops_driver_credentials/"+encodeURIComponent(driverId);
 const credential=await readDoc(token,credentialPath);
 if(!credential||typeof credential.pinSalt!=="string"||typeof credential.pinHash!=="string") return res.status(403).json({error:"A sign-on PIN has not been issued for this driver. Please ask depot management."});
 const now=Date.now(), lockedUntil=Number(credential.lockedUntil||0);
 if(lockedUntil>now) return res.status(429).json({error:"PIN attempts are temporarily locked. Please ask depot management for help."});
 const supplied=Buffer.from(await scrypt(pin,credential.pinSalt,64,{N:16384,r:8,p:1,maxmem:64*1024*1024}));
 const expected=Buffer.from(credential.pinHash,"hex");
 if(expected.length!==supplied.length||!timingSafeEqual(supplied,expected)) {
   const attempts=Number(credential.failedAttempts||0)+1, lock=attempts>=5?now+15*60*1000:0;
   await updateCredential(token,credentialPath,{failedAttempts:{integerValue:String(lock?0:attempts)},lockedUntil:{integerValue:String(lock)}});
   return res.status(lock?429:403).json({error:lock?"Too many incorrect PIN attempts. Ask depot management to reset the PIN.":"That PIN does not match this driver. Check it and try again."});
 }
 if(Number(credential.failedAttempts||0)!==0||lockedUntil!==0) await updateCredential(token,credentialPath,{failedAttempts:{integerValue:"0"},lockedUntil:{integerValue:"0"}});

 if(!geo||geo.enabled!==true||typeof geo.centerLat!=="number"||typeof geo.centerLng!=="number"||typeof geo.radiusMetres!=="number") return res.status(503).json({error:"This depot GPS location has not been configured yet. Please speak to the depot team."});
 const metres=Math.round(distance(latitude,longitude,geo.centerLat,geo.centerLng)); if(metres>geo.radiusMetres) return res.status(403).json({error:"You are about "+metres+"m from the depot. Sign-on is only available within "+geo.radiusMetres+"m."});
 const fields={driverId:{stringValue:driverId},driverName:{stringValue:driver.name},depotSlug:{stringValue:depotSlug},depotName:{stringValue:geo.depotName||depotSlug},workDate:{stringValue:new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/London",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())},createdAt:{integerValue:String(Date.now())},locationLat:{doubleValue:latitude},locationLng:{doubleValue:longitude},locationAccuracy:{doubleValue:accuracy},distanceMetres:{integerValue:String(metres)},geofenceRadiusMetres:{integerValue:String(geo.radiusMetres)},locationVerified:{booleanValue:true},deviceIdHash:{stringValue:createHash("sha256").update(deviceId).digest("hex")}};
 const saved=await fetch(base+"/ops_driver_sign_ons",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({fields})}); if(!saved.ok) throw new Error("The sign-on record could not be saved."); return res.status(200).json({ok:true,distanceMetres:metres});
 } catch(e) { return res.status(502).json({error:e instanceof Error?e.message:"Secure sign-on failed."}); }
}