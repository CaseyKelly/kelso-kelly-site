import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { detectBot } from "@/lib/contact-spam";
import { checkContactRateLimit, getClientIp } from "@/lib/contact-rate-limit";

// Validate required environment variables at initialization
if (!process.env.RESEND_API_KEY) {
  throw new Error("RESEND_API_KEY environment variable is not set");
}
if (!process.env.RESEND_FROM_EMAIL) {
  throw new Error("RESEND_FROM_EMAIL environment variable is not set");
}
if (!process.env.CONTACT_EMAIL) {
  throw new Error("CONTACT_EMAIL environment variable is not set");
}

const resend = new Resend(process.env.RESEND_API_KEY);

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Maximum accepted length per field (characters)
const MAX_LENGTHS = {
  name: 100,
  email: 254,
  eventType: 100,
  date: 50,
  message: 5000,
} as const;

const SUCCESS_BODY = { success: true, message: "Message sent successfully" };

// Sanitize string input to prevent injection
function sanitizeInput(input: string): string {
  return input.trim().replace(/[<>]/g, "");
}

// Single-line fields end up in the subject line, so drop line breaks too
function sanitizeSingleLine(input: string): string {
  return sanitizeInput(input).replace(/[\r\n]+/g, " ");
}

function optionalString(value: unknown): string | null {
  if (value === undefined || value === null) return "";
  return typeof value === "string" ? value : null;
}

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, message: "Invalid request body" },
        { status: 400 }
      );
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return NextResponse.json(
        { success: false, message: "Invalid request body" },
        { status: 400 }
      );
    }
    const fields = body as Record<string, unknown>;

    // Bots get the normal success response so they have nothing to adapt to
    const botReason = detectBot(fields);
    if (botReason) {
      console.warn(`Dropped contact form submission (${botReason})`);
      return NextResponse.json(SUCCESS_BODY, { status: 200 });
    }

    const name = optionalString(fields.name);
    const email = optionalString(fields.email);
    const eventType = optionalString(fields.eventType);
    const date = optionalString(fields.date);
    const message = optionalString(fields.message);
    const newsletter = fields.newsletter === true;

    if (name === null || email === null || eventType === null || date === null || message === null) {
      return NextResponse.json(
        { success: false, message: "Invalid field type" },
        { status: 400 }
      );
    }

    // Validate required fields
    if (!name.trim() || !email.trim() || !message.trim()) {
      return NextResponse.json(
        { success: false, message: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate field lengths
    const values = { name, email, eventType, date, message };
    const tooLong = (Object.keys(MAX_LENGTHS) as (keyof typeof MAX_LENGTHS)[]).find(
      (field) => values[field].length > MAX_LENGTHS[field]
    );
    if (tooLong) {
      return NextResponse.json(
        { success: false, message: `${tooLong} must be at most ${MAX_LENGTHS[tooLong]} characters` },
        { status: 400 }
      );
    }

    // Validate email format
    if (!EMAIL_REGEX.test(email.trim())) {
      return NextResponse.json(
        { success: false, message: "Invalid email address" },
        { status: 400 }
      );
    }

    // Per-IP limit, checked only for submissions that would actually send
    const rateLimit = await checkContactRateLimit(getClientIp(request.headers));
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, message: "Too many messages. Please try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfterSeconds ?? 3600) },
        }
      );
    }

    // Sanitize inputs
    const sanitizedName = sanitizeSingleLine(name);
    const sanitizedMessage = sanitizeInput(message);
    const sanitizedEventType = eventType ? sanitizeSingleLine(eventType) : "";
    const sanitizedDate = date ? sanitizeSingleLine(date) : "";
    const trimmedEmail = email.trim();

    const recipientEmail = process.env.CONTACT_EMAIL!;
    const fromEmail = process.env.RESEND_FROM_EMAIL!;

    // Format the email content
    const emailContent = `
New contact form submission from ${sanitizedName}

Email: ${trimmedEmail}
${sanitizedEventType ? `Event Type: ${sanitizedEventType}` : ""}
${sanitizedDate ? `Event Date: ${sanitizedDate}` : ""}

Message:
${sanitizedMessage}

${newsletter ? "✓ Opted in to newsletter updates" : ""}

---
Submitted from kelso-kelly-music contact form
    `.trim();

    // Send email using Resend
    const emailResponse = await resend.emails.send({
      from: fromEmail,
      to: recipientEmail,
      replyTo: trimmedEmail, // Allow easy reply to the person who submitted
      subject: `New Contact Form: ${sanitizedEventType || "General Inquiry"} - ${sanitizedName}`,
      text: emailContent,
    });

    console.log("Email sent successfully:", emailResponse);

    return NextResponse.json(SUCCESS_BODY, { status: 200 });

  } catch (error) {
    console.error("Error sending contact form email:", error);
    return NextResponse.json(
      { 
        success: false, 
        message: "Failed to send message"
      },
      { status: 500 }
    );
  }
}
