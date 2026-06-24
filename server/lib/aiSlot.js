// server/lib/aiSlot.js
// ponytail: global 2-slot cap; crateLinks + projects share the same pool
let aiSlots = 0
const AI_MAX = 2
const queue = []

export async function withAISlot(fn) {
  if (aiSlots >= AI_MAX) {
    await new Promise(resolve => queue.push(resolve))
  }
  aiSlots++
  try {
    return await fn()
  } finally {
    aiSlots--
    if (queue.length) queue.shift()()
  }
}
