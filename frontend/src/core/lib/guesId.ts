const GUEST_ID_KEY = "doodlz_guest_id";

export const getOrCreateGuestId = () => {
   let id = localStorage.getItem(GUEST_ID_KEY);
   if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(GUEST_ID_KEY, id);
   }
   return id;
}