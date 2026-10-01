import React, { createContext, useMemo, useCallback } from "react";

import useAuth from "../../hooks/useAuth.js/index.js";

const AuthContext = createContext();

const AuthProvider = ({ children }) => {
	const { loading, user, isAuth, handleLogin, handleLogout, socket } = useAuth();

	const value = useMemo(
		() => ({ loading, user, isAuth, handleLogin, handleLogout, socket }),
		[loading, user, isAuth, socket]
	);

	return (
		<AuthContext.Provider
			value={value}
		>
			{children}
		</AuthContext.Provider>
	);
};

export { AuthContext, AuthProvider };