import { useCallback, useEffect, useRef, useState } from 'react'
import { readError } from '../utils/readError.js'

// Long enough for any single remark, short enough that a forgotten
// recording does not run on and turn into a huge upload.
export const MAX_RECORDING_SECONDS = 120

async function transcribe(blob) {
  const res = await fetch('/api/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': blob.type || 'audio/webm' },
    body: blob
  })
  if (!res.ok) { throw new Error(await readError(res)) }
  return (await res.json()).data.text
}

function describeMicError(error) {
  if (error?.name === 'NotAllowedError') { return 'Microphone access was denied. Allow it in the browser\'s site settings.' }
  if (error?.name === 'NotFoundError') { return 'No microphone found.' }
  return error?.message || 'Recording failed.'
}

/**
 * Record a voice note in the browser and turn it into text on the server.
 * `status` is idle, starting (waiting for microphone access), recording,
 * transcribing or error; `onText` receives the transcript. The audio never
 * leaves this machine: the server transcribes it locally and deletes it.
 */
export function useVoiceNote(onText) {
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)
  const [seconds, setSeconds] = useState(0)
  const recorderRef = useRef(null)
  const streamRef = useRef(null)
  // False once the popover is gone. Checked after every await, because
  // microphone access or a transcript can arrive after that.
  const mountedRef = useRef(false)
  const onTextRef = useRef(onText)
  onTextRef.current = onText

  const releaseMic = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }

  const stop = useCallback(() => {
    if (recorderRef.current?.state === 'recording') { recorderRef.current.stop() }
  }, [])

  const start = useCallback(async () => {
    setError(null)
    setStatus('starting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream
      const recorder = new MediaRecorder(stream)
      const chunks = []
      recorder.ondataavailable = (event) => { if (event.data.size > 0) { chunks.push(event.data) } }
      recorder.onstop = async () => {
        releaseMic()
        recorderRef.current = null
        if (!mountedRef.current) { return }
        setStatus('transcribing')
        try {
          const text = await transcribe(new Blob(chunks, { type: recorder.mimeType }))
          if (text) { onTextRef.current(text) }
          setStatus('idle')
        } catch (err) {
          setError(err.message)
          setStatus('error')
        }
      }
      recorderRef.current = recorder
      recorder.start()
      setSeconds(0)
      setStatus('recording')
    } catch (err) {
      releaseMic()
      setError(describeMicError(err))
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    if (status !== 'recording') { return }
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000)
    return () => clearInterval(timer)
  }, [status])

  useEffect(() => {
    if (seconds >= MAX_RECORDING_SECONDS) { stop() }
  }, [seconds, stop])

  // Closing the popover mid-recording must not leave the microphone on.
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (recorderRef.current?.state === 'recording') { recorderRef.current.stop() }
      releaseMic()
    }
  }, [])

  return { status, error, seconds, start, stop }
}
