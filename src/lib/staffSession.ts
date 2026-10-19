export const DEMO_STAFF_KEY = 'seat-map-demo-staff'

export function isDemoStaffSession(): boolean {
  try {
    return sessionStorage.getItem(DEMO_STAFF_KEY) === '1'
  } catch {
    return false
  }
}
