import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Button, Input, Form, Card, CardBody, CardHeader, Divider } from "@heroui/react"

export const Route = createFileRoute('/auth')({
  component: AuthPage,
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      throw redirect({ to: '/' })
    }
  }
})

function AuthPage() {
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'email' | 'otp'>('email')
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
      })

      if (error) throw error
      setStep('otp')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: 'email',
      })

      if (error) throw error
      navigate({ to: '/' })
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-col gap-1 items-center py-6">
          <h1 className="text-2xl font-bold">Welcome Back</h1>
          <p className="text-sm text-gray-500">Sign in to your account</p>
        </CardHeader>
        <Divider />
        <CardBody className="py-6 px-8">
          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-200 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          {step === 'email' ? (
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
                className="w-full"
              >
                Send Code
              </Button>
            </Form>
          ) : (
            <Form onSubmit={handleVerifyCode} className="flex flex-col gap-4">
              <div className="text-sm text-center text-gray-600 mb-2">
                We sent a code to <span className="font-semibold">{email}</span>
              </div>
              <Input
                type="text"
                label="Verification Code"
                placeholder="123456"
                value={otp}
                onValueChange={setOtp}
                isRequired
                variant="bordered"
              />
              <Button 
                type="submit" 
                color="primary" 
                isLoading={loading}
                className="w-full"
              >
                Verify Code
              </Button>
              <Button
                variant="light"
                onPress={() => setStep('email')}
                className="w-full"
              >
                Back to Email
              </Button>
            </Form>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
