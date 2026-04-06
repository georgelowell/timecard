import nodemailer from 'nodemailer';
import { GeoLocation } from '@/types';

const TZ = 'America/New_York';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

function formatETTime(isoString: string): string {
  return new Date(isoString).toLocaleString('en-US', {
    timeZone: TZ,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

export async function sendRemoteCheckInEmail({
  employeeName,
  employeeEmail,
  timestamp,
  timecardId,
  appUrl,
  location,
}: {
  employeeName: string;
  employeeEmail: string;
  timestamp: string;
  timecardId: string;
  appUrl: string;
  location?: GeoLocation | null;
}) {
  const managerEmails = (process.env.MANAGER_EMAILS || '').split(',').filter(Boolean);
  if (managerEmails.length === 0) return;

  const approveUrl = `${appUrl}/api/approve-remote?timecardId=${timecardId}`;
  const formattedTime = formatETTime(timestamp);

  const locationHtml = location
    ? `<p style="margin: 8px 0;">
        <strong>Location:</strong>
        <a href="https://maps.google.com/?q=${location.lat},${location.lng}"
           style="color: #7B604B;">
          ${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}
        </a>
        <span style="color: #666; font-size: 13px;">
          &nbsp;(±${Math.round(location.accuracy)}m accuracy)
        </span>
      </p>`
    : `<p style="margin: 8px 0; color: #666;"><strong>Location:</strong> Not captured</p>`;

  await transporter.sendMail({
    from: process.env.GMAIL_USER,
    to: managerEmails.join(', '),
    subject: `Remote Check-In Approval Required: ${employeeName}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #231F20;">Remote Check-In Approval Required</h2>
        <p><strong>${employeeName}</strong> (${employeeEmail}) has requested a remote check-in.</p>
        <p style="margin: 8px 0;"><strong>Time:</strong> ${formattedTime}</p>
        ${locationHtml}
        <p style="margin-top: 20px;">Please review and approve this remote check-in:</p>
        <a href="${approveUrl}"
           style="display: inline-block; background: #7B604B; color: white; padding: 12px 24px;
                  border-radius: 6px; text-decoration: none; font-weight: bold; margin: 16px 0;">
          Approve Remote Check-In
        </a>
        <p style="color: #666; font-size: 14px;">
          If you did not expect this request, you can ignore this email.
        </p>
      </div>
    `,
  });
}

export async function sendLongShiftEmail({
  employeeName,
  employeeEmail,
  checkInTime,
  hoursElapsed,
  employeeId,
  appUrl,
}: {
  employeeName: string;
  employeeEmail: string;
  checkInTime: string;
  hoursElapsed: number;
  employeeId: string;
  appUrl: string;
}) {
  const managerEmails = (process.env.MANAGER_EMAILS || '').split(',').filter(Boolean);
  if (managerEmails.length === 0) return;

  const formattedCheckIn = formatETTime(checkInTime);
  const dashboardUrl = `${appUrl}/dashboard/timecards?employeeId=${employeeId}`;

  await transporter.sendMail({
    from: process.env.GMAIL_USER,
    to: managerEmails.join(', '),
    subject: `Long Shift Alert: ${employeeName} has been clocked in for ${hoursElapsed.toFixed(1)} hours`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #231F20;">Long Shift Alert</h2>
        <p>
          <strong>${employeeName}</strong> (${employeeEmail}) has been clocked in for
          <strong>${hoursElapsed.toFixed(1)} hours</strong> without clocking out.
        </p>
        <p style="margin: 8px 0;"><strong>Clocked in at:</strong> ${formattedCheckIn}</p>
        <p style="margin-top: 20px;">You may want to check in with this employee or close their shift manually:</p>
        <a href="${dashboardUrl}"
           style="display: inline-block; background: #231F20; color: #E9E8E0; padding: 12px 24px;
                  border-radius: 6px; text-decoration: none; font-weight: bold; margin: 16px 0;">
          View Timecards
        </a>
      </div>
    `,
  });
}
