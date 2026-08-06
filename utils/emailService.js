import nodemailer from 'nodemailer';

let transporter;

// Built lazily on first use — env vars depend on dotenv having already run.
const getTransporter = () => {
  if (!transporter) {
    const service = process.env.EMAIL_SERVICE;

    if (service === 'custom') {
      transporter = nodemailer.createTransport({
        host: 'smtpout.secureserver.net',
        port: 465,
        secure: true,
        auth: {
          user: process.env.GO_DADDY_EMAIL_USER,
          pass: process.env.GO_DADDY_EMAIL_PASSWORD,
        },
      });
    } else {
      // default: gmail
      transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_PASSWORD,
        },
      });
    }
  }
  return transporter;
};

/**
 * Send password reset OTP email
 * @param {string} email - User's email address
 * @param {string} otp - 6-digit one-time code
 * @returns {Promise<Object>} - Nodemailer response
 */
const getSenderAddress = () =>
  process.env.EMAIL_SERVICE === 'custom'
    ? process.env.GO_DADDY_EMAIL_FROM || process.env.GO_DADDY_EMAIL_USER
    : process.env.EMAIL_FROM || process.env.GMAIL_USER || 'noreply@Testopy.com';

export const sendPasswordResetOtpEmail = async (email, otp) => {
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #007bff; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
          .content { background-color: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; }
          .otp { display: inline-block; background-color: #fff; color: #007bff; font-size: 32px; font-weight: bold; letter-spacing: 8px; padding: 16px 24px; border-radius: 5px; margin: 20px 0; border: 1px dashed #007bff; }
          .footer { margin-top: 20px; font-size: 12px; color: #666; text-align: center; }
          .warning { background-color: #fff3cd; border: 1px solid #ffc107; padding: 10px; border-radius: 5px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Password Reset Request</h1>
          </div>
          <div class="content">
            <p>Hello,</p>
            <p>We received a request to reset your password. Use the code below to continue:</p>

            <div class="otp">${otp}</div>

            <p><strong>This code expires in 10 minutes.</strong></p>

            <div class="warning">
              <p><strong>⚠️ Security Notice:</strong></p>
              <p>If you did not request a password reset, please ignore this email or contact our support team immediately. Never share this code with anyone.</p>
            </div>

            <p>Best regards,<br>The Testopy Team</p>
          </div>
          <div class="footer">
            <p>© 2026 Testopy. All rights reserved.</p>
            <p>This is an automated email. Please do not reply.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const textContent = `
    Password Reset Request

    Hello,

    We received a request to reset your password. Use this code to continue:

    ${otp}

    This code expires in 10 minutes.

    Security Notice:
    If you did not request a password reset, please ignore this email or contact our support team immediately. Never share this code with anyone.

    Best regards,
    The Testopy Team

    © 2026 Testopy. All rights reserved.
  `;

  try {
    const mailOptions = {
      from: getSenderAddress(),
      to: email,
      subject: 'Your Password Reset Code - Testopy',
      text: textContent,
      html: htmlContent,
    };

    const info = await getTransporter().sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending password reset OTP email:', error);
    throw error;
  }
};

/**
 * Send account confirmation email (for future use)
 * @param {string} email - User's email address
 * @param {string} confirmationUrl - Full confirmation URL
 * @returns {Promise<Object>} - Nodemailer response
 */
export const sendConfirmationEmail = async (email, confirmationUrl) => {
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #28a745; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
          .content { background-color: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; }
          .button { display: inline-block; background-color: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to Testopy!</h1>
          </div>
          <div class="content">
            <p>Thank you for signing up. Please confirm your email address by clicking the button below:</p>
            <a href="${confirmationUrl}" class="button">Confirm Email</a>
            <p>Best regards,<br>The Testopy Team</p>
          </div>
        </div>
      </body>
    </html>
  `;

  try {
    const mailOptions = {
      from: getSenderAddress(),
      to: email,
      subject: 'Confirm Your Email - Testopy',
      html: htmlContent,
    };

    const info = await getTransporter().sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending confirmation email:', error);
    throw error;
  }
};

/**
 * Verify email service is working (useful for health checks)
 * @returns {Promise<boolean>} - true if service is working
 */
export const verifyEmailService = async () => {
  try {
    await getTransporter().verify();
    return true;
  } catch (error) {
    console.error('Email service verification failed:', error);
    return false;
  }
};

export default {
  sendPasswordResetOtpEmail,
  sendConfirmationEmail,
  verifyEmailService,
};
