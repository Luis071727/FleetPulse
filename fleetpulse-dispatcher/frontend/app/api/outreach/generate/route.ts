import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY || "" });

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      carrier: {
        dot_number: string;
        legal_name: string;
        state: string;
        city: string;
        power_units: number;
        drivers: number;
        carrier_operation?: string | null;
        authorized_for_hire?: boolean;
        hauls_hazmat?: boolean;
        add_date?: string | null;
        last_filing?: string | null;
        annual_mileage?: number;
      };
      dispatcher_name?: string;
      dispatcher_company?: string;
      tone?: "friendly" | "professional" | "urgent";
    };

    const { carrier, dispatcher_name, dispatcher_company, tone = "professional" } = body;

    if (!process.env.ANTHROPIC_KEY) {
      return NextResponse.json({ data: buildFallbackOutreach(carrier, dispatcher_name, dispatcher_company) });
    }

    const toneInstruction =
      tone === "friendly" ? "warm, approachable, and conversational"
      : tone === "urgent" ? "direct and emphasizing capacity needs urgently"
      : "professional and concise";

    const isNewEntrant = carrier.add_date
      ? (Date.now() - new Date(carrier.add_date).getTime()) < 1000 * 60 * 60 * 24 * 365 * 2
      : false;

    const filingAge = carrier.last_filing
      ? Math.floor((Date.now() - new Date(carrier.last_filing).getTime()) / (1000 * 60 * 60 * 24 * 30))
      : null;

    const prompt = `You are a freight dispatcher writing a cold outreach email to a trucking carrier to offer them loads.

Carrier details:
- Company: ${carrier.legal_name}
- Location: ${carrier.city}, ${carrier.state}
- Fleet size: ${carrier.power_units} trucks, ${carrier.drivers} drivers
- Operation type: ${carrier.carrier_operation || "General Freight"}
- Authorized for hire: ${carrier.authorized_for_hire ? "Yes" : "No"}
- Hauls hazmat: ${carrier.hauls_hazmat ? "Yes" : "No"}
- DOT #: ${carrier.dot_number}
${isNewEntrant ? "- New entrant (registered within last 2 years) — mention you can help them grow their book of business" : ""}
${filingAge !== null ? `- Last MCS-150 filing: ${filingAge} months ago` : ""}
${carrier.annual_mileage ? `- Annual mileage: ${carrier.annual_mileage.toLocaleString()} miles` : ""}

Dispatcher info:
- Name: ${dispatcher_name || "the dispatcher"}
- Company: ${dispatcher_company || "our dispatch company"}

Write a ${toneInstruction} outreach email. Keep it under 150 words. Be specific about their fleet size and location to show you've done research. End with a clear call to action (reply or call). No subject line needed — just the email body.`;

    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "";
    return NextResponse.json({ data: text });
  } catch (err) {
    return NextResponse.json({ data: null, error: String(err) }, { status: 500 });
  }
}

function buildFallbackOutreach(
  carrier: { legal_name: string; city: string; state: string; power_units: number },
  dispatcherName?: string,
  dispatcherCompany?: string,
) {
  return `Hi ${carrier.legal_name} team,

I'm ${dispatcherName || "reaching out"} from ${dispatcherCompany || "our dispatch office"} and came across your operation out of ${carrier.city}, ${carrier.state}.

With your ${carrier.power_units}-truck fleet, I think we'd be a great fit. We are testing a simple tool where you send the driver a magic link, they upload the documents, and the system sends the full invoice package to the broker.

Looking for 5 carriers to test it with real loads (free 5-invoice pack).

Interested?

Best,
${dispatcherName || "The Dispatch Team"}
${dispatcherCompany || ""}`.trim();
}
