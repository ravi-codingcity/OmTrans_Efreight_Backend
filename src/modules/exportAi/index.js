/* ------------------------------------------------------------------ */
/*  Export-AI module entrypoint.                                       */
/*  Exposes the AI + Jobs routers for mounting on the EXISTING Express */
/*  server. Reuses the existing Mongo connection, User model and JWT   */
/*  auth — no duplicate auth/DB/user systems.                          */
/* ------------------------------------------------------------------ */
const aiRoutes = require("./routes/ai.routes");
const jobRoutes = require("./routes/job.routes");

module.exports = { aiRoutes, jobRoutes };
