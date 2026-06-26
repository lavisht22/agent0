import { Resend } from "resend";

/**
 * Transactional email via Resend. Currently only the sign-in OTP; better-auth's
 * emailOTP plugin calls `sendSignInOtp` from its `sendVerificationOTP` hook.
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

/**
 * Workspace invitation email. `acceptUrl` carries the raw, single-use token; the
 * recipient signs in with the same email and the link exchanges it for
 * membership. `inviterName` is best-effort (falls back to a generic phrasing).
 */
export async function sendWorkspaceInvite(params: {
	email: string;
	acceptUrl: string;
	workspaceName: string;
	inviterName: string | null;
}): Promise<void> {
	const { email, acceptUrl, workspaceName, inviterName } = params;

	const from = process.env.RESEND_FROM_EMAIL;
	if (!from) {
		throw new Error(
			"RESEND_FROM_EMAIL is not set (verified Resend sender, e.g. 'agent0 <login@yourdomain.com>')",
		);
	}

	const inviter = inviterName ? `${inviterName} has` : "You've been";

	const { error } = await resend.emails.send({
		from,
		to: email,
		subject: `You've been invited to ${workspaceName} on agent0`,
		text: `${inviter} invited you to join the "${workspaceName}" workspace on agent0.\n\nAccept the invitation:\n${acceptUrl}\n\nSign in with this email address (${email}) to accept. The invitation expires in 7 days. If you weren't expecting this, you can safely ignore this email.`,
	});

	if (error) {
		throw new Error(`Failed to send workspace invite: ${error.message}`);
	}
}
