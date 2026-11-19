import { createIdListStore } from './idListStore';

/** "Want to try": same key and shape as the website (and every earlier app version). */
export const FAVOURITES_KEY = 'abf_favourites';
/** "Been there": new, same shape. */
export const BEEN_THERE_KEY = 'abf_been_there';

const wantToTry = createIdListStore(FAVOURITES_KEY);
const beenThere = createIdListStore(BEEN_THERE_KEY);

export const getFavourites = wantToTry.get;
export const getFavouritesState = wantToTry.getState;
export const subscribeFavourites = wantToTry.subscribe;
export const loadFavourites = wantToTry.load;
/** The heart toggle. Adding a place that is in Been there moves it, so it is never in both lists. */
export async function toggleFavourite(id: string): Promise<string[]> {
  await Promise.all([wantToTry.load(), beenThere.load()]);
  if (!wantToTry.getState().ids.includes(id) && beenThere.getState().ids.includes(id)) {
    await beenThere.remove(id);
  }
  return wantToTry.toggle(id);
}
export const isFavouritesLoaded = (): boolean => wantToTry.getState().loaded;

export const getBeenThere = beenThere.get;
export const getBeenThereState = beenThere.getState;
export const subscribeBeenThere = beenThere.subscribe;
export const loadBeenThere = beenThere.load;
export const addBeenThere = beenThere.add;
export const removeBeenThere = beenThere.remove;

/** Been There: out of Want to try, into Been there. Added first so the place is never in neither list. */
export async function moveToBeenThere(id: string): Promise<void> {
  await beenThere.add(id);
  await wantToTry.remove(id);
}

/** Move back: out of Been there, into Want to try. */
export async function moveBackToWantToTry(id: string): Promise<void> {
  await wantToTry.add(id);
  await beenThere.remove(id);
}

export const removeFavourite = wantToTry.remove;
/** Saved > Clear on the Want To Try / Been There list. */
export const clearWantToTry = wantToTry.clear;
export const clearBeenThere = beenThere.clear;

/** Resets both lists (they share one lifecycle in tests). */
export function __resetFavouritesForTests(): void {
  wantToTry.reset();
  beenThere.reset();
}
