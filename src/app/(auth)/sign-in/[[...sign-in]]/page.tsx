import Image from "next/image";
import { SignIn } from "@clerk/nextjs";

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
} satisfies Parameters<typeof SignIn>[0]["appearance"];

export default function SignInPage() {
  return (
    <div className="flex min-h-screen bg-slate-100">
      <div className="relative flex h-screen w-full flex-col overflow-hidden bg-white shadow-none lg:flex-row lg:shadow-lg">
        <div className="relative hidden h-full w-full flex-col justify-between overflow-hidden px-12 py-12 text-white lg:flex lg:w-1/2">
          <Image
            src="/Cover1.jpg"
            alt="Scheduling workspace illustration"
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
              Schedule smarter.
            </h2>
            <p className="max-w-sm text-sm text-slate-100/80 lg:text-base">
              Build balanced shifts, surface coverage gaps, and keep every
              store aligned from one collaborative workspace.
            </p>
          </div>
          <div className="relative mt-8 flex w-full flex-col gap-3 text-sm text-slate-100/80">
            <p className="font-medium uppercase tracking-[0.3em] text-slate-200/60">
              Plan • Adapt • Deliver
            </p>
            <p className="max-w-sm leading-relaxed">
              “Tachora gives managers the tools to orchestrate shifts with
              confidence while keeping every store staffed and compliant.”
            </p>
          </div>
        </div>

        <div className="flex h-full w-full items-center justify-center bg-white px-6 py-10 sm:px-10 lg:w-1/2 lg:px-14">
          <div className="w-full max-w-md">
            <SignIn
              appearance={appearance}
              path="/sign-in"
              routing="path"
              signUpUrl="/sign-up"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
