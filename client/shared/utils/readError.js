/** The error message a failed API response carries, or its status when the body has none. */
export async function readError(res) {
  try {
    return (await res.json()).error || `Server responded with ${res.status}`
  } catch {
    return `Server responded with ${res.status}`
  }
}
