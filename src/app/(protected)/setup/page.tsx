"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

const timeSchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm format");

const storeSchema = z.object({
  name: z.string().min(2, "Store name must be at least 2 characters"),
  country: z.literal("BE"),
  city: z.string().min(2, "Select a city"),
  address: z.string().optional(),
  openingTime: timeSchema,
});

type StoreFormValues = z.infer<typeof storeSchema>;

type SetupBootstrapResponse = {
  store: { id: string; name: string; address: string; city: string; country: string; openingTime?: string } | null;
  onboardingStep: "STORE" | "EMPLOYEES" | "SHIFTS" | "DONE";
};

const defaultStoreValues: StoreFormValues = {
  name: "",
  country: "BE",
  city: "",
  address: "",
  openingTime: "09:00",
};

export default function SetupPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cities, setCities] = useState<string[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<StoreFormValues>({
    resolver: zodResolver(storeSchema),
    defaultValues: defaultStoreValues,
  });

  const { register, handleSubmit, formState: { errors, isSubmitting }, reset } = form;

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        const [setupRes, citiesRes] = await Promise.all([
          fetch("/api/setup", { cache: "no-store" }),
          fetch("/api/be/cities", { cache: "force-cache" }),
        ]);
        if (!setupRes.ok) throw new Error("Failed to load setup");
        const setup: SetupBootstrapResponse = await setupRes.json();
        if (setup.onboardingStep === "DONE") {
          router.replace("/schedule");
          return;
        }
        const cityList = await citiesRes.json().catch(() => ({ cities: [] }));
        if (!active) return;
        setCities(Array.isArray(cityList.cities) ? cityList.cities : []);
        reset(
          setup.store
            ? {
                name: setup.store.name,
                country: "BE",
                city: setup.store.city || "",
                address: setup.store.address || "",
                openingTime: setup.store.openingTime || "09:00",
              }
            : defaultStoreValues,
        );
        setIsLoading(false);
      } catch (e) {
        if (!active) return;
        setLoadError("Unable to load setup data.");
        setIsLoading(false);
      }
    }

    bootstrap();
    return () => { active = false; };
  }, [reset, router]);

  async function onSubmit(values: StoreFormValues) {
    setServerError(null);
    try {
      const res = await fetch("/api/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: values.name,
          city: values.city,
          address: values.address ?? "",
          openingTime: values.openingTime,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setServerError(typeof data.error === "string" ? data.error : "Unable to save store");
        return;
      }
      router.push("/schedule");
    } catch (e) {
      setServerError("Unable to save store. Please try again.");
    }
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-slate-50 py-10">
        <div className="mx-auto max-w-5xl space-y-6 px-6">
          <div className="h-6 w-32 animate-pulse rounded-full bg-slate-200" />
          <div className="h-10 w-72 animate-pulse rounded-full bg-slate-200" />
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="space-y-4">
              <div className="h-4 w-1/3 animate-pulse rounded-full bg-slate-200" />
              <div className="h-4 w-2/3 animate-pulse rounded-full bg-slate-200" />
              <div className="h-4 w-1/2 animate-pulse rounded-full bg-slate-200" />
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">Something went wrong</h1>
          <p className="mt-3 text-sm text-slate-600">{loadError}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Refresh
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 py-10">
      <div className="mx-auto max-w-5xl space-y-8 px-6">
        <header className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Guided setup</p>
          <h1 className="text-3xl font-semibold text-slate-900">Let&apos;s get your store ready</h1>
          <p className="text-sm text-slate-600">You can add employees and shifts after saving your store.</p>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
            <div>
              <label className="text-sm font-medium text-slate-700" htmlFor="store-name">Store name</label>
              <input
                id="store-name"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
                placeholder="eg. Tachora Antwerp"
                {...register("name")}
              />
              {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-slate-700" htmlFor="store-country">Country</label>
                <input
                  id="store-country"
                  className="mt-1 w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-600"
                  disabled
                  value="Belgium"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700" htmlFor="store-city">City</label>
                <select
                  id="store-city"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  {...register("city")}
                >
                  <option value="">Select a city</option>
                  {cities.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                {errors.city && <p className="mt-1 text-xs text-red-600">{errors.city.message}</p>}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-slate-700" htmlFor="store-address">Address</label>
                <textarea
                  id="store-address"
                  className="mt-1 h-24 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  placeholder="Street + number, postal code"
                  {...register("address")}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700" htmlFor="store-opening">Opening time</label>
                <input
                  type="time"
                  id="store-opening"
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  {...register("openingTime")}
                />
                {errors.openingTime && <p className="mt-1 text-xs text-red-600">{errors.openingTime.message}</p>}
              </div>
            </div>

            {serverError && <p className="text-sm text-red-600">{serverError}</p>}

            <div className="flex items-center justify-end gap-3">
              <button
                type="submit"
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:bg-slate-800"
                disabled={isSubmitting}
              >
                Save & Continue
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
