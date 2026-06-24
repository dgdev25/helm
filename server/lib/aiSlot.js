// server/lib/aiSlot.js
// ponytail: global 2-slot cap; crateLinks + projects share the same pool
let aiSlots = 0
const AI_MAX = 2
const queue = []

export async function withAISlot(fn) {
  if (aiSlots >= AI_MAX) {
    await new Promise((resolve, reject) => {
      let waiter
      const timer = setTimeout(() => {
        const idx = queue.indexOf(waiter)
        if (idx !== -1) queue.splice(idx, 1)
        reject(Object.assign(new Error('AI slot queue timeout'), { statusCode: 429 }))
      }, 30000)
      waiter = () => { clearTimeout(timer); resolve() }
      queue.push(waiter)
    })
  }
  aiSlots++
  try {
    return await fn()
  } finally {
    aiSlots--
    if (queue.length) queue.shift()()
  }
}
