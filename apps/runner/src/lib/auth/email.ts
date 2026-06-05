import { Resend } from "resend";

/**
 * Transactional email via Resend (Phase 2 of the Supabase migration). Currently
 * only the sign-in OTP; better-auth's emailOTP plugin calls `sendSignInOtp`
 * from its `sendVerificationOTP` hook.
 */
const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendSignInOtp(email: string, otp: string): Promise<void> {
	const from = process.env.RESEND_FROM_EMAIL;
	if (!from) {
		throw new Error(
			"RESEND_FROM_EMAIL is not set (verified Resend sender, e.g. 'agent0 <login@yourdomain.com>')",
		);
	}

	const { error } = await resend.emails.send({
		from,
		to: email,
		subject: "Your agent0 sign-in code",
		text: `Your agent0 sign-in code is ${otp}\n\nIt expires in 5 minutes. If you didn't request this, you can safely ignore this email.`,
	});

	if (error) {
		throw new Error(`Failed to send sign-in OTP: ${error.message}`);
	}
}
