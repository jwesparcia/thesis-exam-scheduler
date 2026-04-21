import { useContext } from "react";
import { ThemeContext } from "../context/themeStore.jsx";

export const useTheme = () => useContext(ThemeContext);
export default useTheme;