/**
 * What a markdown decision adds for its review session: the new notes as
 * threads with their file and anchor, the reviewed files, and where each
 * carried thread is in this round.
 */

import { readAnnotatableFile } from './file.js'
import { hashOf, displayPath } from './fileNames.js'
import { decidedNotes } from './feedback.js'
import { createAnchor, locateThread, refreshAnchor } from './anchorThreads.js'
import { withAttachmentNames } from './attachments.js'

/** Every file of the review as it is on disk now. One that cannot be read any more is left out, its threads become orphans. */
export async function currentFiles(stores) {
  const files = await Promise.all(stores.map(async ({ absolutePath }) => {
    const content = await readAnnotatableFile(absolutePath).catch(() => null)
    if (content === null) { return null }
    return { absolutePath, path: displayPath(absolutePath), content, contentHash: hashOf(content) }
  }))
  return files.filter(Boolean)
}

// The client names a file by the path /api/files gave it, which follows the order of the stores.
const fileFor = (files, submitted, index) => files.find((f) => f.path === submitted?.path) ?? files[index]

/** The decided notes in feedback order and, per note id, the file and anchor its thread keeps. */
export function decidedThreads(submittedFiles, files) {
  const notes = decidedNotes(submittedFiles)
  const threadFields = {}
  for (const { annotation, fileIndex, block } of notes) {
    const file = fileFor(files, submittedFiles[fileIndex], fileIndex)
    threadFields[annotation.id] = file ? { file: file.absolutePath, anchor: createAnchor(annotation, block, file) } : { file: null, anchor: null }
  }
  return { annotations: notes.map((n) => withAttachmentNames(n.annotation)), threadFields }
}

/** Where each carried thread is in this round, by handle, for the heading the agent reads. */
export function placesOf(carried, files) {
  const byPath = new Map(files.map((f) => [f.absolutePath, f]))
  return Object.fromEntries(carried.map((thread) => [thread.handle, locateThread(thread, byPath.get(thread.file))]))
}

/** Each carried thread's anchor at its place in this round, by handle, for the next round to compare with. */
export function anchorsOf(carried, files) {
  const byPath = new Map(files.map((f) => [f.absolutePath, f]))
  return Object.fromEntries(carried.map((thread) => [thread.handle, refreshAnchor(thread, byPath.get(thread.file))]))
}

/** The decision fields a session needs. Read once, so notes and carried threads see the same files. */
export async function sessionFields(stores, submittedFiles, carried) {
  const files = await currentFiles(stores)
  return { ...decidedThreads(submittedFiles, files), files, places: placesOf(carried, files), anchors: anchorsOf(carried, files) }
}
