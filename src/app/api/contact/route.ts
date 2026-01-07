import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

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

interface ContactFormData {
  name: string;
  email: string;
  eventType: string;
  date: string;
  message: string;
  newsletter: boolean;
}

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Sanitize string input to prevent injection
function sanitizeInput(input: string): string {
  return input.trim().replace(/[<>]/g, "");
}

export async function POST(request: NextRequest) {
  try {
    const body: ContactFormData = await request.json();
    const { name, email, eventType, date, message, newsletter } = body;

    // Validate required fields
    if (!name || !email || !message) {
      return NextResponse.json(
        { success: false, message: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate email format
    if (!EMAIL_REGEX.test(email)) {
      return NextResponse.json(
        { success: false, message: "Invalid email address" },
        { status: 400 }
      );
    }

    // Sanitize inputs
    const sanitizedName = sanitizeInput(name);
    const sanitizedMessage = sanitizeInput(message);
    const sanitizedEventType = eventType ? sanitizeInput(eventType) : "";

    const recipientEmail = process.env.CONTACT_EMAIL!;
    const fromEmail = process.env.RESEND_FROM_EMAIL!;

    // Format the email content
    const emailContent = `
New contact form submission from ${sanitizedName}

Email: ${email}
${sanitizedEventType ? `Event Type: ${sanitizedEventType}` : ""}
${date ? `Event Date: ${date}` : ""}

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
      replyTo: email, // Allow easy reply to the person who submitted
      subject: `New Contact Form: ${sanitizedEventType || "General Inquiry"} - ${sanitizedName}`,
      text: emailContent,
    });

    console.log("Email sent successfully:", emailResponse);

    return NextResponse.json(
      { 
        success: true, 
        message: "Message sent successfully"
      },
      { status: 200 }
    );

  } catch (error) {
    console.error("Error sending contact form email:", error);
    return NextResponse.json(
      { 
        success: false, 
        message: error instanceof Error ? error.message : "Failed to send message"
      },
      { status: 500 }
    );
  }
}
