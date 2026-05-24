export const API = import.meta.env.VITE_API_URL;

export const token = () => localStorage.getItem("ce_token");

export const authH = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${token()}`,
});

export const jsonH = { "Content-Type": "application/json" };
