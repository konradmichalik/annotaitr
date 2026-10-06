/** The response envelope every API route answers with. */
export function success(data) { return { success: true, data } }
export function failure(error) { return { success: false, error } }
