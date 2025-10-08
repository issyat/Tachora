import { NextResponse } from "next/server";

// Minimal list of Belgian municipalities (can be extended later)
const cities = [
  "Antwerpen",
  "Brussels",
  "Gent",
  "Brugge",
  "Leuven",
  "Mechelen",
  "Hasselt",
  "Genk",
  "Kortrijk",
  "Oostende",
  "Aalst",
  "Sint-Niklaas",
  "Roeselare",
  "Turnhout",
  "Mons",
  "Liège",
  "Namur",
  "Charleroi",
  "La Louvière",
  "Tournai",
  "Arlon",
  "Wavre",
  "Nivelles",
  "Verviers",
  "Seraing",
  "Mouscron",
  "Louvain-la-Neuve",
];

export async function GET() {
  return NextResponse.json({ cities });
}
