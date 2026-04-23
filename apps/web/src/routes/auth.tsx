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
import { supabase } from "../lib/supabase";

export const Route = createFileRoute("/auth")({
	component: RouteComponent,
	beforeLoad: async () => {
		const {
			data: { session },
		} = await supabase.auth.getSession();
		if (session) {
			throw redirect({ to: "/" });
		}
	},
});

function RouteComponent() {
	const [email, setEmail] = useState("");
	const [otp, setOtp] = useState("");
	const [loading, setLoading] = useState(false);
	const [step, setStep] = useState<"email" | "otp">("email");

	const navigate = useNavigate();

	const handleSendCode = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoading(true);

		try {
			const { error } = await supabase.auth.signInWithOtp({
				email,
			});

			if (error) throw error;

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
			const { error } = await supabase.auth.verifyOtp({
				email,
				token: otp,
				type: "email",
			});

			if (error) throw error;

			navigate({ to: "/" });
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

	return (
		<div className="min-h-screen flex flex-col items-center justify-center p-4">
			<div className="w-full max-w-sm space-y-8">
				<div className="text-center space-y-2">
					<h1 className="text-3xl font-medium tracking-tight">
						{step === "email" ? "Welcome back" : "Check your email"}
					</h1>
					<p className="text-default-500">
						{step === "email"
							? "Enter your email to sign in to your account"
							: `We've sent a code to ${email}`}
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
				) : (
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
				)}
			</div>
		</div>
	);
}
