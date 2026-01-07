import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

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

    // Get the recipient email from environment variable
    // Use CONTACT_EMAIL for testing (your email), can switch to dad's email later
    const recipientEmail = process.env.CONTACT_EMAIL;

    if (!recipientEmail) {
      console.error("CONTACT_EMAIL environment variable not set");
      return NextResponse.json(
        { success: false, message: "Email configuration error" },
        { status: 500 }
      );
    }

    // Format the email content
    const emailContent = `
New contact form submission from ${name}

Email: ${email}
${eventType ? `Event Type: ${eventType}` : ""}
${date ? `Event Date: ${date}` : ""}

Message:
${message}

${newsletter ? "✓ Opted in to newsletter updates" : ""}

---
Submitted from kelso-kelly-music contact form
    `.trim();

    // Send email using Resend
    const emailResponse = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "contact@kelso-kelly-music.com",
      to: recipientEmail,
      replyTo: email, // Allow easy reply to the person who submitted
      subject: `New Contact Form: ${eventType || "General Inquiry"} - ${name}`,
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
