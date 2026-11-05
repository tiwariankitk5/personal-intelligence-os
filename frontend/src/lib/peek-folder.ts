import {createFolder,getFolders} from "./api";
import type {ApiFolder} from "./api";
export const PEEK_FOLDER_NAME="Peek notes";
export function isPeekFolder(folder:{name:string}){return folder.name.trim().toLowerCase()===PEEK_FOLDER_NAME.toLowerCase();}
export async function ensurePeekFolder(known?:ApiFolder[]):Promise<ApiFolder>{
  const existing=(known||await getFolders()).find(isPeekFolder);if(existing)return existing;
  // The existing per-user folder-name constraint makes concurrent creation safe.
  try{return await createFolder(PEEK_FOLDER_NAME,"#a5cdd8");}catch(error){const found=(await getFolders()).find(isPeekFolder);if(found)return found;throw error;}
}
