import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export interface WebhookAlert {
  type: 'renewal_failed' | 'duplicate_detected' | 'expired_found' | 'renewal_success';
  message: string;
  details?: unknown;
}

/**
 * Send email alert about webhook issues
 * Only sends in production to avoid spam during development
 */
export async function sendWebhookAlert(alert: WebhookAlert): Promise<void> {
  // Only send emails in production to avoid spam during development
  if (process.env.NODE_ENV !== 'production') {
    console.log('[DEV] Would send alert:', alert);
    return;
  }

  try {
    const subject = `🔔 Webhook Alert: ${alert.type.replace(/_/g, ' ').toUpperCase()}`;
    
    const emailContent = `
Webhook Alert: ${alert.message}

Type: ${alert.type}
Timestamp: ${new Date().toISOString()}

${alert.details ? `Details:\n${JSON.stringify(alert.details, null, 2)}` : ''}

---
Kelso Kelly Music Website
https://kelso-kelly-site.vercel.app
    `.trim();

    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
      to: 'casey.kelly819@gmail.com',
      subject,
      text: emailContent,
    });

    console.log('Alert email sent:', alert.type);
  } catch (error) {
    console.error('Failed to send webhook alert email:', error);
    // Don't throw - we don't want email failures to break the cron job
  }
}

/**
 * Send a success summary email after webhook operations
 * Only sends if there were actual changes or failures
 */
export async function sendWebhookSummary(summary: {
  renewed: number;
  failed: number;
  duplicatesCleaned: number;
}): Promise<void> {
  if (summary.renewed === 0 && summary.failed === 0 && summary.duplicatesCleaned === 0) {
    return; // Don't send email if nothing happened
  }

  const hasFailures = summary.failed > 0 || summary.duplicatesCleaned > 0;
  
  await sendWebhookAlert({
    type: hasFailures ? 'renewal_failed' : 'renewal_success',
    message: `Webhook renewal completed: ${summary.renewed} renewed, ${summary.failed} failed, ${summary.duplicatesCleaned} duplicates cleaned`,
    details: summary,
  });
}
