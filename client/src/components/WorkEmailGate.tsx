import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { firebaseConfigured } from "@/lib/firebase";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { ShieldCheck, ArrowUpRight } from "lucide-react";
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

  const heading = mode === "signin" ? "Welcome back" : mode === "signup" ? "Create your access" : "Reset your password";
  const description = mode === "signup"
    ? "Use the work email you have been invited with. Your team lead manages access."
    : mode === "reset"
      ? "Enter your Swans Travel work email and we’ll send reset instructions."
      : "Sign in with your approved Swans Travel work email.";

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#F7F6F3] px-4 py-5 text-[#171717] sm:px-6 sm:py-8">
      <div className="pointer-events-none absolute -right-28 -top-32 h-80 w-80 rounded-full border border-[#D8C9A3]/40" />
      <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full border border-[#D8C9A3]/30" />

      <div className="relative mx-auto flex min-h-[calc(100svh-2.5rem)] w-full max-w-6xl flex-col overflow-hidden rounded-[1.6rem] border border-[#E8E5DE] bg-white shadow-[0_28px_80px_-48px_rgba(31,29,24,0.28)] sm:min-h-[calc(100svh-4rem)] lg:grid lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative flex flex-col justify-between overflow-hidden bg-white px-7 py-8 sm:px-10 sm:py-10 lg:px-14 lg:py-12">
          <div>
            <div className="flex min-h-20 items-center">
              <img
                src="/swans-travel-logo-header.png"
                alt="Swans Travel, part of the Coach Travel Group"
                className="h-auto w-[230px] max-w-full object-contain object-left"
              />
            </div>

            <div className="mt-12 max-w-lg sm:mt-16 lg:mt-24">
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#9A782D]">
                Operations workspace
              </p>
              <h1 className="mt-5 max-w-md text-[2.45rem] font-light leading-[1.12] tracking-[-0.055em] text-[#171717] sm:text-5xl">
                Keeping every part of the operation <span className="font-medium">connected.</span>
              </h1>
              <div className="mt-7 h-px w-16 bg-[#B08B3B]" />
              <p className="mt-6 max-w-sm text-sm leading-7 text-[#77746E]">
                One place for daily operations, team coordination and compliance oversight across Swans Travel.
              </p>
            </div>
          </div>

          <div className="mt-12 flex items-start gap-3 border-t border-[#EEECE7] pt-5">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#A17D32]" />
            <p className="max-w-sm text-xs leading-5 text-[#77746E]">
              Private team access. Sign in using an approved <strong className="font-semibold text-[#45433E]">@swanstravel.com</strong> work email.
            </p>
          </div>

          <div className="pointer-events-none absolute -bottom-24 -right-16 h-64 w-64 rotate-[-35deg] border-l-[22px] border-[#E9E1D1]/60" />
        </section>

        <section className="flex flex-1 items-center justify-center border-t border-[#EEECE7] bg-[#FBFAF8] px-6 py-10 sm:px-10 lg:border-l lg:border-t-0 lg:px-12">
          <div className="w-full max-w-[390px]">
            <div className="mb-9">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#A17D32]">
                Secure team access
              </p>
              <h2 className="mt-3 text-3xl font-light tracking-[-0.045em] text-[#191919]">{heading}</h2>
              <p className="mt-3 text-sm leading-6 text-[#77746E]">{description}</p>
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
                {busy ? "Please wait…" : mode === "signin" ? "Sign in to Command Centre" : mode === "signup" ? "Create account" : "Send reset link"}
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
                  First time here?
                </button>
              )}
              {mode !== "reset" ? (
                <button type="button" onClick={() => { setMode("reset"); setMessage(""); }} className="transition-colors hover:text-[#4C3B18]">
                  Forgot password?
                </button>
              ) : null}
            </div>

            <p className="mt-12 border-t border-[#EAE7E0] pt-5 text-[10px] leading-5 tracking-[0.04em] text-[#9A978F]">
              SWANS TRAVEL <span className="px-1.5 text-[#B08B3B]">/</span> OPERATIONS COMMAND CENTRE
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
