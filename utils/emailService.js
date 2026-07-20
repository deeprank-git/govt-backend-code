import nodemailer from 'nodemailer';

// Gmail SMTP — free, used for now. Requires a Google Account with 2FA enabled
// and an "App Password" (not the regular account password) in GMAIL_PASSWORD.
// Gmail SMTP has sending-rate limits and is flagged by some providers, so it
// should be swapped for a dedicated transactional email provider before
// this goes to production at any real volume.
let transporter;

const initializeEmailService = () => {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASSWORD,
    },
  });
};

// Initialize on module load
initializeEmailService();

/**
 * Send password reset email
 * @param {string} email - User's email address
 * @param {string} resetToken - Reset token
 * @param {string} resetUrl - Full reset URL (e.g., https://yourdomain.com/reset-password?token=...)
 * @returns {Promise<Object>} - Nodemailer response
 */
export const sendPasswordResetEmail = async (email, resetToken, resetUrl) => {
  if (!transporter) {
    throw new Error('Email service not initialized');
  }

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #007bff; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
          .content { background-color: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; }
          .button { display: inline-block; background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
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
            <p>We received a request to reset your password. Click the button below to proceed:</p>
            
            <a href="${resetUrl}" class="button">Reset Password</a>
            
            <p>Or copy and paste this link in your browser:</p>
            <p style="word-break: break-all; background-color: #fff; padding: 10px; border-left: 3px solid #007bff;">
              ${resetUrl}
            </p>
            
            <p><strong>This link expires in 1 hour.</strong></p>
            
            <div class="warning">
              <p><strong>⚠️ Security Notice:</strong></p>
              <p>If you did not request a password reset, please ignore this email or contact our support team immediately. Your account is safe as long as you don't click the link above.</p>
            </div>
            
            <p>Best regards,<br>The GovtPrep Team</p>
          </div>
          <div class="footer">
            <p>© 2026 GovtPrep. All rights reserved.</p>
            <p>This is an automated email. Please do not reply.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const textContent = `
    Password Reset Request
    
    Hello,
    
    We received a request to reset your password. Click the link below or copy it in your browser:
    
    ${resetUrl}
    
    This link expires in 1 hour.
    
    Security Notice:
    If you did not request a password reset, please ignore this email or contact our support team immediately.
    
    Best regards,
    The GovtPrep Team
    
    © 2026 GovtPrep. All rights reserved.
  `;

  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.GMAIL_USER || 'noreply@govtprep.com',
      to: email,
      subject: 'Password Reset Request - GovtPrep',
      text: textContent,
      html: htmlContent,
    };

    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending password reset email:', error);
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
  if (!transporter) {
    throw new Error('Email service not initialized');
  }

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
            <h1>Welcome to GovtPrep!</h1>
          </div>
          <div class="content">
            <p>Thank you for signing up. Please confirm your email address by clicking the button below:</p>
            <a href="${confirmationUrl}" class="button">Confirm Email</a>
            <p>Best regards,<br>The GovtPrep Team</p>
          </div>
        </div>
      </body>
    </html>
  `;

  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.GMAIL_USER || 'noreply@govtprep.com',
      to: email,
      subject: 'Confirm Your Email - GovtPrep',
      html: htmlContent,
    };

    const info = await transporter.sendMail(mailOptions);
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
  if (!transporter) {
    return false;
  }

  try {
    await transporter.verify();
    return true;
  } catch (error) {
    console.error('Email service verification failed:', error);
    return false;
  }
};

export default {
  sendPasswordResetEmail,
  sendConfirmationEmail,
  verifyEmailService,
};
