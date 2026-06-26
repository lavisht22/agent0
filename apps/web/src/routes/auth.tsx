import {
	Button,
	Form,
	Input,
	InputOTP,
	Label,
	Spinner,
	TextField,
	toast,
} from "@heroui/react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
	authClient,
	getCachedSession,
	invalidateSession,
} from "../lib/auth-client";

// `redirect` lets flows that require auth (e.g. an invite link) bounce through
// login and land back where they started. Defaults to the app root.
export const Route = createFileRoute("/auth")({
	component: RouteComponent,
	validateSearch: (search: Record<string, unknown>) => ({
		redirect: typeof search.redirect === "string" ? search.redirect : undefined,
	}),
	beforeLoad: async ({ search }) => {
		// Already authenticated (valid session cookie) → skip the login screen.
		const session = await getCachedSession();
		if (session) {
			throw redirect({ to: search.redirect ?? "/" });
		}
	},
});

function RouteComponent() {
	const { redirect: redirectTo } = Route.useSearch();
	const [email, setEmail] = useState("");
	const [otp, setOtp] = useState("");
	const [name, setName] = useState("");
	const [loading, setLoading] = useState(false);
	const [step, setStep] = useState<"email" | "otp" | "name">("email");

	const navigate = useNavigate();

	const finish = () => navigate({ to: redirectTo ?? "/" });

	const handleSendCode = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoading(true);

		try {
			const { error } = await authClient.emailOtp.sendVerificationOtp({
				email,
				type: "sign-in",
			});

			if (error) throw new Error(error.message);

			setStep("otp");
		} catch (error) {
			toast.danger(
				error instanceof Error
					? error.message
					: "Unable to send OTP at the moment.",
			);
		} finally {
			setLoading(false);
		}
	};

	const handleVerifyCode = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoading(true);

		try {
			const { error } = await authClient.signIn.emailOtp({
				email,
				otp,
			});

			if (error) throw new Error(error.message);

			// Sign-in set the session cookie; drop the cached "logged out" answer so
			// the destination route's guard re-reads it.
			invalidateSession();

			// OTP sign-up never collects a name, so first-time users (including
			// invitees) land here without one. Prompt for it before continuing.
			const session = await getCachedSession(true);
			if (!session?.user?.name) {
				setStep("name");
				return;
			}

			finish();
		} catch (error) {
			toast.danger(
				error instanceof Error
					? error.message
					: "Unable to verify OTP at the moment.",
			);
		} finally {
			setLoading(false);
		}
	};

	const handleSaveName = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoading(true);

		try {
			const { error } = await authClient.updateUser({ name: name.trim() });

			if (error) throw new Error(error.message);

			// Refresh the cached session so the new name is reflected app-wide.
			invalidateSession();
			finish();
		} catch (error) {
			toast.danger(
				error instanceof Error
					? error.message
					: "Unable to save your name at the moment.",
			);
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="min-h-screen flex flex-col items-center justify-center p-4">
			<div className="w-full max-w-sm space-y-8">
				<div className="text-center space-y-2">
					<h1 className="text-3xl font-medium tracking-tight">
						{step === "email"
							? "Welcome back"
							: step === "otp"
								? "Check your email"
								: "One last thing"}
					</h1>
					<p className="text-muted">
						{step === "email"
							? "Enter your email to sign in to your account"
							: step === "otp"
								? `We've sent a code to ${email}`
								: "What should we call you?"}
					</p>
				</div>
				{step === "email" ? (
					<Form onSubmit={handleSendCode} className="flex flex-col gap-4">
						<TextField name="email" isRequired className="w-full">
							<Label>Email</Label>
							<Input
								type="email"
								placeholder="you@example.com"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
							/>
						</TextField>
						<Button
							type="submit"
							variant="primary"
							size="lg"
							isPending={loading}
							className="w-full"
						>
							{({ isPending }) => (
								<>
									{isPending && <Spinner color="current" size="sm" />}
									Send Code
								</>
							)}
						</Button>
					</Form>
				) : step === "otp" ? (
					<Form
						onSubmit={handleVerifyCode}
						className="flex flex-col gap-4 items-center"
					>
						<InputOTP
							autoFocus
							maxLength={6}
							value={otp}
							onChange={setOtp}
							required
						>
							<InputOTP.Group>
								<InputOTP.Slot index={0} />
								<InputOTP.Slot index={1} />
								<InputOTP.Slot index={2} />
								<InputOTP.Slot index={3} />
								<InputOTP.Slot index={4} />
								<InputOTP.Slot index={5} />
							</InputOTP.Group>
						</InputOTP>
						<Button
							type="submit"
							variant="primary"
							size="lg"
							isPending={loading}
							className="w-full"
						>
							{({ isPending }) => (
								<>
									{isPending && <Spinner color="current" size="sm" />}
									Verify Code
								</>
							)}
						</Button>
						<Button
							variant="tertiary"
							size="lg"
							onPress={() => setStep("email")}
							className="w-full"
						>
							Back to Email
						</Button>
					</Form>
				) : (
					<Form onSubmit={handleSaveName} className="flex flex-col gap-4">
						<TextField name="name" isRequired className="w-full">
							<Label>Name</Label>
							<Input
								autoFocus
								placeholder="Jane Doe"
								value={name}
								onChange={(e) => setName(e.target.value)}
							/>
						</TextField>
						<Button
							type="submit"
							variant="primary"
							size="lg"
							isPending={loading}
							isDisabled={name.trim().length === 0}
							className="w-full"
						>
							{({ isPending }) => (
								<>
									{isPending && <Spinner color="current" size="sm" />}
									Continue
								</>
							)}
						</Button>
					</Form>
				)}
			</div>
		</div>
	);
}
