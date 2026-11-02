import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { firebaseConfigured } from "@/lib/firebase";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { ArrowUpRight } from "lucide-react";
import { useState } from "react";

export function WorkEmailGate() {
  const { signIn, signUp, resetPassword } = useWorkspace();
  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const submit = async () => {
    setBusy(true);
    setMessage("");
    try {
      if (mode === "signin") {
        await signIn(email, password);
      } else if (mode === "signup") {
        await signUp(name, email, password);
        setMessage("Your account is ready. Check your work inbox to verify the email address.");
      } else {
        await resetPassword(email);
        setMessage("Password reset instructions have been sent if that work email is registered.");
      }
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Sign-in could not be completed.");
    } finally {
      setBusy(false);
    }
  };

  const heading = mode === "signin" ? "Staff login" : mode === "signup" ? "Create account" : "Reset password";
  const description = mode === "signup"
    ? "Enter your name, work email and choose a password."
    : mode === "reset"
      ? "Enter your work email and we’ll send you a reset link."
      : "Sign in with your Swans Travel work email and password.";

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#F7F6F3] px-4 py-5 text-[#171717] sm:px-6 sm:py-8">
      <div className="pointer-events-none absolute -right-28 -top-32 h-80 w-80 rounded-full border border-[#D8C9A3]/40" />
      <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full border border-[#D8C9A3]/30" />

      <div className="relative mx-auto flex w-full max-w-6xl flex-col overflow-hidden rounded-[1.6rem] border border-[#E8E5DE] bg-white shadow-[0_20px_60px_-44px_rgba(31,29,24,0.24)] lg:min-h-[calc(100svh-4rem)] lg:grid lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative bg-white px-7 py-6 sm:px-10 sm:py-8 lg:flex lg:items-start lg:px-14 lg:py-12">
          <img
            src="/swans-travel-logo-header.png"
            alt="Swans Travel, part of the Coach Travel Group"
            className="h-auto w-[210px] max-w-full object-contain object-left sm:w-[230px]"
          />
        </section>

        <section className="flex flex-1 items-center justify-center border-t border-[#EEECE7] bg-[#FBFAF8] px-6 py-8 sm:px-10 sm:py-10 lg:border-l lg:border-t-0 lg:px-12">
          <div className="w-full max-w-[390px]">
            <div className="mb-7">
              <h2 className="text-3xl font-light tracking-[-0.045em] text-[#191919]">{heading}</h2>
              <p className="mt-2 text-sm leading-6 text-[#77746E]">{description}</p>
            </div>

            {!firebaseConfigured ? (
              <p className="mb-5 rounded-xl border border-[#E8D6B8] bg-[#FBF4E8] p-3 text-xs leading-5 text-[#8A6425]">
                Firebase is not configured. Add the Vercel environment variables from <code>.env.example</code> before production login.
              </p>
            ) : null}

            <form
              className="space-y-5"
              onSubmit={event => {
                event.preventDefault();
                if (!busy && firebaseConfigured) void submit();
              }}
            >
              {mode === "signup" ? (
                <div className="space-y-2">
                  <Label htmlFor="swans-name" className="text-xs font-semibold text-[#4C4A45]">Your name</Label>
                  <Input
                    id="swans-name"
                    value={name}
                    onChange={event => setName(event.target.value)}
                    placeholder="Your name"
                    autoComplete="name"
                    className="h-12 rounded-xl border-[#E4E0D7] bg-white px-4 text-sm shadow-none placeholder:text-[#AAA69D] focus-visible:border-[#B08B3B] focus-visible:ring-[#B08B3B]/20"
                  />
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="swans-email" className="text-xs font-semibold text-[#4C4A45]">Work email</Label>
                <Input
                  id="swans-email"
                  type="email"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  placeholder="name@swanstravel.com"
                  autoComplete="email"
                  required
                  className="h-12 rounded-xl border-[#E4E0D7] bg-white px-4 text-sm shadow-none placeholder:text-[#AAA69D] focus-visible:border-[#B08B3B] focus-visible:ring-[#B08B3B]/20"
                />
              </div>

              {mode !== "reset" ? (
                <div className="space-y-2">
                  <Label htmlFor="swans-password" className="text-xs font-semibold text-[#4C4A45]">Password</Label>
                  <Input
                    id="swans-password"
                    type="password"
                    value={password}
                    onChange={event => setPassword(event.target.value)}
                    placeholder="Your password"
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    required
                    className="h-12 rounded-xl border-[#E4E0D7] bg-white px-4 text-sm shadow-none placeholder:text-[#AAA69D] focus-visible:border-[#B08B3B] focus-visible:ring-[#B08B3B]/20"
                  />
                </div>
              ) : null}

              {message ? (
                <p role="status" className="rounded-xl border border-[#E8E2D5] bg-[#F5F2EB] p-3 text-xs leading-5 text-[#62563D]">
                  {message}
                </p>
              ) : null}

              <Button
                type="submit"
                className="group h-12 w-full rounded-xl bg-[#202020] text-sm font-semibold text-white shadow-none transition-colors hover:bg-[#3A352B] disabled:opacity-50"
                disabled={busy || !firebaseConfigured}
              >
                {busy ? "Please wait…" : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
                <ArrowUpRight className="ml-2 h-4 w-4 text-[#D7B96F] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </Button>
            </form>

            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-3 text-xs font-semibold text-[#8A6B2D]">
              {mode !== "signin" ? (
                <button type="button" onClick={() => { setMode("signin"); setMessage(""); }} className="transition-colors hover:text-[#4C3B18]">
                  Back to sign in
                </button>
              ) : (
                <button type="button" onClick={() => { setMode("signup"); setMessage(""); }} className="transition-colors hover:text-[#4C3B18]">
                  Create account
                </button>
              )}
              {mode !== "reset" ? (
                <button type="button" onClick={() => { setMode("reset"); setMessage(""); }} className="transition-colors hover:text-[#4C3B18]">
                  Forgot password?
                </button>
              ) : null}
            </div>

            <p className="mt-8 border-t border-[#EAE7E0] pt-4 text-[10px] leading-5 tracking-[0.04em] text-[#9A978F]">
              SWANS TRAVEL
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
