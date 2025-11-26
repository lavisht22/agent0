import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { supabase } from '../lib/supabase'

export const Route = createFileRoute('/_app')({
  component: AppLayout,
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      throw redirect({ to: '/auth' })
    }
  }
})

function AppLayout() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Basic Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex justify-between items-center">
        <div className="font-bold text-xl">Agent0</div>
        <div className="text-sm text-gray-500">v1.0.0</div>
      </header>
      
      {/* Main Content */}
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  )
}
