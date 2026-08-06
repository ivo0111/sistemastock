import { useState, useEffect } from 'react'
import { get } from '../api/client'

const POLL_INTERVAL = 180000 // 3 minutos

export function useStockBajo(user) {
  const [stockBajo, setStockBajo] = useState([])

  const isAdmin = user?.rol === 'admin' || user?.rol === 'dueño'

  useEffect(() => {
    if (!isAdmin) return

    let active = true

    async function fetchStockBajo() {
      try {
        const data = await get('/reportes/stock-bajo')
        if (active) setStockBajo(data || [])
      } catch (err) {
        console.error('Error fetching stock bajo:', err)
      }
    }

    fetchStockBajo()
    const interval = setInterval(fetchStockBajo, POLL_INTERVAL)

    return () => {
      active = false
      clearInterval(interval)
    }
  }, [isAdmin])

  return { stockBajo, count: stockBajo.length }
}
