import { create } from 'zustand'
import { alarmSound } from '../lib/alarmAudio'

export interface LowStockItem {
  id: string | number
  name: string
  variantName?: string
  stock: number
  alertThreshold: number
  barcode?: string
  category?: string
}

interface AlarmState {
  lowStockItems: LowStockItem[]
  isAlarmActive: boolean
  silencedItemIds: Set<string | number>
  setLowStockItems: (items: LowStockItem[]) => void
  silenceAlarm: () => void
  resetSilencedState: () => void
}

export const useAlarmStore = create<AlarmState>((set, get) => ({
  lowStockItems: [],
  isAlarmActive: false,
  silencedItemIds: new Set<string | number>(),

  setLowStockItems: (items) => {
    const { silencedItemIds, lowStockItems: previousItems } = get()
    
    // Alarm triggers only if there is at least one low-stock item that has not been acknowledged
    const hasUnsilencedLowStock = items.some(
      (item) => !silencedItemIds.has(String(item.id)) && !silencedItemIds.has(item.id)
    )

    if (items.length > 0 && hasUnsilencedLowStock) {
      // Check if alarm was already active - if not, make sure to start it
      const wasAlarmActive = get().isAlarmActive
      
      // Always start/restart the alert to ensure sound plays
      alarmSound.startAlert()
      set({ lowStockItems: items, isAlarmActive: true })
      
      // If alarm wasn't active before, this is a new alert - log it for debugging
      if (!wasAlarmActive) {
        console.log('[Low Stock Alert] New low stock items detected:', items.length)
      }
    } else {
      // If no items or all items are acknowledged/silenced, ensure alert is stopped
      alarmSound.stopAlert()
      set({ lowStockItems: items, isAlarmActive: false })
      if (items.length === 0) {
        set({ silencedItemIds: new Set() })
      }
    }
  },

  silenceAlarm: () => {
    const currentItemIds = get().lowStockItems.map((i) => String(i.id))
    alarmSound.stopAlert()
    set({
      isAlarmActive: false,
      silencedItemIds: new Set(currentItemIds),
    })
  },

  resetSilencedState: () => {
    set({ silencedItemIds: new Set() })
  },
}))
