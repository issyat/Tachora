import Image from "next/image";
import { SignUp } from "@clerk/nextjs";

const appearance = {
  variables: {
    colorPrimary: "#0f172a",
    borderRadius: "0.75rem",
  },
  elements: {
    card: "shadow-none border border-slate-200 bg-white/95 backdrop-blur",
    headerTitle: "text-slate-900",
    headerSubtitle: "text-slate-500",
    formButtonPrimary:
      "bg-slate-900 hover:bg-slate-800 focus:bg-slate-900 text-white",
    socialButtonsBlockButton:
      "border border-slate-200 hover:border-slate-300 text-slate-700",
    formFieldInput:
      "rounded-lg border-slate-200 focus:border-slate-900 focus:ring-slate-900/10",
    footerActionLink: "text-slate-900 hover:text-slate-700",
  },
} satisfies Parameters<typeof SignUp>[0]["appearance"];

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen bg-slate-100">
      <div className="relative flex h-screen w-full flex-col overflow-hidden bg-white shadow-none lg:flex-row lg:shadow-lg">
        <div className="relative hidden h-full w-full flex-col justify-between overflow-hidden px-12 py-12 text-white lg:flex lg:w-1/2">
          <Image
            src="/Cover1.jpg"
            alt="Team collaboration illustration"
            fill
            priority
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-slate-950/70" />
          <div className="relative flex flex-col gap-4">
            <span className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.2em] text-slate-200/80">
              Tachora
            </span>
            <h2 className="text-3xl font-semibold leading-tight lg:text-4xl">
              Join the team.
            </h2>
            <p className="max-w-sm text-sm text-slate-100/80 lg:text-base">
              Create an account to access multi-store scheduling, availability
              tracking, and AI-powered planning tools.
            </p>
          </div>
          <div className="relative mt-8 flex w-full flex-col gap-3 text-sm text-slate-100/80">
            <p className="font-medium uppercase tracking-[0.3em] text-slate-200/60">
              Onboard • Coordinate • Scale
            </p>
            <p className="max-w-sm leading-relaxed">
              Bring your stores, employees, and AI assistants together in one
              powerful scheduling hub.
            </p>
          </div>
        </div>

        <div className="flex h-full w-full items-center justify-center bg-white px-6 py-10 sm:px-10 lg:w-1/2 lg:px-14">
          <div className="w-full max-w-md">
            <SignUp
              appearance={appearance}
              path="/sign-up"
              routing="path"
              signInUrl="/sign-in"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
