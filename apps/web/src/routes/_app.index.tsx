import { createFileRoute } from '@tanstack/react-router'
import { Card, CardBody } from "@heroui/react"
import { Construction } from 'lucide-react'

export const Route = createFileRoute('/_app/')({
  component: DashboardPage,
})

function DashboardPage() {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh]">
      <Card className="w-full max-w-lg">
        <CardBody className="py-12 px-8 flex flex-col items-center text-center gap-4">
          <div className="p-4 bg-primary-50 rounded-full text-primary-500 mb-2">
            <Construction size={48} />
          </div>
          <h1 className="text-3xl font-bold">Coming Soon</h1>
          <p className="text-gray-500 text-lg">
            We are working hard to bring you the best agent experience. 
            Stay tuned for updates!
          </p>
        </CardBody>
      </Card>
    </div>
  )
}
