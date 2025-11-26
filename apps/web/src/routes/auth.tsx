import { useState } from "react";
import { Button, Input, Form, InputOtp, addToast } from "@heroui/react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { supabase } from "../lib/supabase";

export const Route = createFileRoute("/auth")({
	component: AuthPage,
	beforeLoad: async () => {
		const {
			data: { session },
		} = await supabase.auth.getSession();
		if (session) {
			throw redirect({ to: "/" });
		}
	},
});

function AuthPage() {
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
		} catch (err: any) {
			addToast({
				title: "Error",
				description: err.message,
				color: "danger",
			});
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
		} catch (err: any) {
			addToast({
				title: "Error",
				description: err.message,
				color: "danger",
			});
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
						<Input
							type="email"
							label="Email"
							placeholder="you@example.com"
							value={email}
							onValueChange={setEmail}
							isRequired
							variant="bordered"
						/>
						<Button
							type="submit"
							color="primary"
							isLoading={loading}
							fullWidth
							size="lg"
						>
							Send Code
						</Button>
					</Form>
				) : (
					<Form
						onSubmit={handleVerifyCode}
						className="flex flex-col gap-4 items-center"
					>
						<InputOtp
							autoFocus
							length={6}
							value={otp}
							onValueChange={setOtp}
							isRequired
							variant="bordered"
							size="lg"
						/>
						<Button
							type="submit"
							color="primary"
							isLoading={loading}
							fullWidth
							size="lg"
						>
							Verify Code
						</Button>
						<Button
							variant="light"
							onPress={() => setStep("email")}
							fullWidth
							size="lg"
						>
							Back to Email
						</Button>
					</Form>
				)}
			</div>
		</div>
	);
}
