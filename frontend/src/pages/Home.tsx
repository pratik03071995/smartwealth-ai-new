import React from 'react'
import Chat from '../components/Chat'

export default function Home() {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <Chat variant="canvas" className="flex-1" />
    </div>
  )
}
