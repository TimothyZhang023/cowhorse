import { getOrCreateLocalUser } from "../models/database.js";
import { getUserSystemConfig } from "../utils/systemConfig.js";

export function authMiddleware(req, res, next) {
  const localUser = getOrCreateLocalUser();
  getUserSystemConfig(localUser.uid, { username: localUser.username });
  req.uid = localUser.uid;
  req.user = localUser;
  req.token = "local-mode-token";
  next();
}

export function optionalAuth(req, res, next) {
  const localUser = getOrCreateLocalUser();
  getUserSystemConfig(localUser.uid, { username: localUser.username });
  req.uid = localUser.uid;
  req.user = localUser;
  req.token = "local-mode-token";
  next();
}
