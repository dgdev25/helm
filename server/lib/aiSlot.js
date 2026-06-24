// server/lib/aiSlot.js
// ponytail: global 2-slot cap; crateLinks + projects share the same pool
let aiSlots = 0
const AI_MAX = 2
const queue = []

export async function withAISlot(fn) {
  if (aiSlots >= AI_MAX) {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = queue.indexOf(resolve)
        if (idx !== -1) queue.splice(idx, 1)
        reject(Object.assign(new Error('AI slot queue timeout'), { statusCode: 429 }))
      }, 30000)
      queue.push(() => { clearTimeout(timer); resolve() })
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
