import { useEffect, useRef, useState } from "react";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
const SLUGS = [
  { slug: "big-6", label: "BIG 6", logo: "/assets/big6-amarillo.png" },
  { slug: "mid-6", label: "MID 6", logo: "/assets/mid6-amarillo.png" },
];
const SCORE_OPTIONS = Array.from({ length: 20 }, (_, index) => String(index + 1));
const LOADING_SIX_PATH = "M225.047 520.556C179.031 520.556 139.007 510.969 104.974 491.796C71.4207 472.623 45.5367 444.582 27.322 407.673C9.10734 370.764 0 325.228 0 271.063C0 213.064 10.785 163.932 32.355 123.668C54.4043 83.404 84.6023 52.7267 122.949 31.636C161.775 10.5453 206.353 0 256.683 0C283.526 0 309.17 2.87599 333.616 8.62798C358.062 14.38 379.153 23.008 396.888 34.512L353.748 120.073C339.847 110.486 324.988 104.015 309.17 100.66C293.352 96.8253 276.815 94.908 259.559 94.908C215.94 94.908 181.428 108.09 156.023 134.453C130.618 160.816 117.916 199.882 117.916 251.65C117.916 260.278 117.916 269.865 117.916 280.41C118.395 290.955 119.833 301.501 122.23 312.046L89.875 281.848C98.9823 263.154 110.726 247.576 125.106 235.113C139.486 222.171 156.502 212.584 176.155 206.353C196.287 199.642 218.336 196.287 242.303 196.287C274.898 196.287 304.137 202.758 330.021 215.7C355.905 228.642 376.516 246.857 391.855 270.344C407.673 293.831 415.582 321.393 415.582 353.029C415.582 387.062 406.954 416.78 389.698 442.185C372.921 467.11 350.153 486.523 321.393 500.424C293.112 513.845 260.997 520.556 225.047 520.556ZM218.576 433.557C234.873 433.557 249.253 430.681 261.716 424.929C274.658 418.698 284.724 409.83 291.914 398.326C299.104 386.822 302.699 373.64 302.699 358.781C302.699 335.773 294.79 317.558 278.972 304.137C263.633 290.236 243.022 283.286 217.138 283.286C199.882 283.286 184.783 286.641 171.841 293.352C158.899 299.583 148.593 308.451 140.924 319.955C133.734 330.98 130.139 343.922 130.139 358.781C130.139 373.161 133.734 386.103 140.924 397.607C148.114 408.632 158.18 417.499 171.122 424.21C184.064 430.441 199.882 433.557 218.576 433.557Z";

export default function App() {
  const [route, setRoute] = useState(window.location.pathname);
  const [showLoadingScreen, setShowLoadingScreen] = useState(true);

  useEffect(() => {
    const syncRoute = () => setRoute(window.location.pathname);
    window.addEventListener("popstate", syncRoute);
    window.addEventListener("app:navigate", syncRoute);
    return () => {
      window.removeEventListener("popstate", syncRoute);
      window.removeEventListener("app:navigate", syncRoute);
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowLoadingScreen(false), 1900);
    return () => window.clearTimeout(timer);
  }, []);

  const currentView = route.startsWith("/equipo")
    ? <TeamApp />
    : route.startsWith("/admin")
      ? <AdminApp />
      : <PublicApp />;

  return (
    <>
      {currentView}
      {showLoadingScreen && <AppLoadingScreen />}
    </>
  );
}

function parseTeamRoute() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  const eventSlug = SLUGS.some((item) => item.slug === parts[1]) ? parts[1] : "";
  const view = eventSlug ? parts[2] : parts[1];
  return { eventSlug, view: view || "" };
}

function navigateTo(path, replace = false) {
  if (window.location.pathname === path) return;
  window.history[replace ? "replaceState" : "pushState"]({}, "", path);
  window.dispatchEvent(new Event("app:navigate"));
}

function setPageTitle(slug, title) {
  const label = SLUGS.find((item) => item.slug === slug)?.label;
  document.title = label ? `${label} - ${title}` : `BIG 6 / MID 6 - ${title}`;
}

function PublicApp() {
  const routeSlug = window.location.pathname.split("/").filter(Boolean)[1];
  const [slug, setSlug] = useState(SLUGS.some((item) => item.slug === routeSlug) ? routeSlug : "big-6");
  const [leaderboard, setLeaderboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isTv, setIsTv] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  const online = useOnlineStatus();

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const data = await api(`/api/leaderboards/${slug}`);
        if (active) setLeaderboard(data);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    const timer = window.setInterval(load, 1_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [slug]);

  const activeLogo = SLUGS.find((item) => item.slug === slug)?.logo;
  const activeLabel = SLUGS.find((item) => item.slug === slug)?.label || "BIG 6";
  const sharePath = `${window.location.origin}/leaderboard/${slug}`;

  useEffect(() => {
    setPageTitle(slug, isTv ? "Modo TV" : "Leaderboard");
  }, [isTv, slug]);

  async function copyLeaderboardLink() {
    try {
      if (window.navigator.clipboard?.writeText) {
        await window.navigator.clipboard.writeText(sharePath);
      } else {
        copyWithFallback(sharePath);
      }
      setCopyMessage("Enlace copiado.");
      window.setTimeout(() => setCopyMessage(""), 2200);
    } catch {
      try {
        copyWithFallback(sharePath);
        setCopyMessage("Enlace copiado.");
        window.setTimeout(() => setCopyMessage(""), 2200);
      } catch {
        setCopyMessage("No pudimos copiar el enlace.");
      }
    }
  }

  if (isTv) {
    return (
      <main className="app public-view tv-mode">
        <aside className="tv-sidebar">
          <div className="tv-brand">
            <img src={activeLogo} alt={activeLabel} />
            <span>Live Scoring</span>
          </div>
          <TournamentTabs value={slug} onChange={setSlug} />
          <div className="tv-sidebar-meta">
            <span>{leaderboard?.tournament?.courseName || "Campo"}</span>
            <strong>Vista pública</strong>
          </div>
          <button className="button subtle" onClick={() => setIsTv(false)}>Salir TV</button>
        </aside>
        <section className="tv-stage">
          <header className="tv-stage-header">
            <div>
              <span>Leaderboard en vivo</span>
              <h1>Leaderboard</h1>
            </div>
            <strong>{translateStatus(leaderboard?.tournament?.status)}</strong>
          </header>
          <div className="tv-board">
            {loading ? (
              <LeaderboardSkeleton />
            ) : (
              <>
                <PodiumDisplay podium={leaderboard?.podium} />
                <LeaderboardTable data={leaderboard} animateChanges />
              </>
            )}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="app public-view">
      <Hero
        eyebrow="Vista publica"
        title={activeLabel}
        titleLogo={activeLogo}
        subtitle="Live Scoring · Leaderboard en vivo, hoyos jugados y resultado contra par."
      />
      <StatusBar online={online} leaderboard={leaderboard} />
      {copyMessage && <div className="notice band">{copyMessage}</div>}
      <section className="toolbar band">
        <TournamentTabs value={slug} onChange={setSlug} />
        <div className="toolbar-actions">
          <button className="button subtle" onClick={() => setIsTv((value) => !value)}>
            {isTv ? "Salir TV" : "Modo TV"}
          </button>
          {!isTv && (
            <button className="button primary share-button" onClick={copyLeaderboardLink}>Copiar enlace publico</button>
          )}
        </div>
      </section>
      <section className="dashboard-grid leaderboard-only">
        <Panel title="Leaderboard" kicker={leaderboard?.tournament?.name || "Torneo"}>
          {loading ? (
            <LeaderboardSkeleton />
          ) : (
            <>
              <PodiumDisplay podium={leaderboard?.podium} />
              <LeaderboardTable data={leaderboard} animateChanges />
            </>
          )}
        </Panel>
      </section>
    </main>
  );
}

function TeamApp() {
  const [session, setSession] = useStoredSession("team-session");
  const [{ eventSlug, view }, setTeamRoute] = useState(parseTeamRoute);
  const [leaderboard, setLeaderboard] = useState(null);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState({ username: "", password: "" });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const online = useOnlineStatus();
  const selectedEvent = SLUGS.find((item) => item.slug === eventSlug);

  useEffect(() => {
    const titleSlug = detail?.slug || session?.tournamentSlug || eventSlug;
    const title = session ? "Marcador Equipo" : "Login Equipo";
    setPageTitle(titleSlug, title);
  }, [detail?.slug, eventSlug, session]);

  useEffect(() => {
    const syncRoute = () => setTeamRoute(parseTeamRoute());
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, []);

  useEffect(() => {
    if (!session && eventSlug && view !== "login") {
      navigateTo(`/equipo/${eventSlug}/login`, true);
      setTeamRoute(parseTeamRoute());
      return;
    }

    if (!eventSlug && session?.tournamentSlug) {
      navigateTo(`/equipo/${session.tournamentSlug}/marcador`, true);
      setTeamRoute(parseTeamRoute());
      return;
    }

    if (!eventSlug || !session?.tournamentSlug) return;

    if (session.tournamentSlug !== eventSlug) {
      navigateTo(`/equipo/${session.tournamentSlug}/marcador`, true);
      setTeamRoute(parseTeamRoute());
      return;
    }

    if (view === "login" || !view) {
      navigateTo(`/equipo/${eventSlug}/marcador`, true);
      setTeamRoute(parseTeamRoute());
    }
  }, [eventSlug, session, view]);

  useEffect(() => {
    if (!session?.teamId) return;
    let active = true;
    async function load() {
      const me = await api("/api/me", { token: session.token });
      const slug = me.tournamentSlug || session.tournamentSlug || eventSlug || "big-6";
      const [board, tournament] = await Promise.all([
        api(`/api/leaderboards/${slug}`),
        api(`/api/tournaments/${slug}`),
      ]);
      if (active) {
        if (!session.tournamentSlug && me.tournamentSlug) {
          setSession({ ...session, tournamentSlug: me.tournamentSlug });
        }
        setLeaderboard(board);
        setDetail(tournament);
      }
    }
    load();
    const timer = window.setInterval(load, 1_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [eventSlug, session, setSession]);

  async function login(event) {
    event.preventDefault();
    try {
      const data = await api("/api/auth/login", { method: "POST", body: form });
      if (data.role !== "Team") throw new Error("Este acceso es solo para equipos.");
      if (eventSlug && data.tournamentSlug !== eventSlug) {
        const eventName = SLUGS.find((item) => item.slug === eventSlug)?.label || "este torneo";
        throw new Error(`Este usuario no pertenece a ${eventName}.`);
      }
      setSession(data);
      const targetSlug = data.tournamentSlug || eventSlug || "big-6";
      navigateTo(`/equipo/${targetSlug}/marcador`, true);
      setTeamRoute(parseTeamRoute());
      setMessage("");
    } catch (error) {
      setMessage(error.message || "No pudimos iniciar sesion.");
    }
  }

  async function submitScore(payload) {
    if (saving) return;
    setSaving(true);
    try {
      await api(`/api/teams/${session.teamId}/scores/${payload.holeNumber}`, {
        method: "PUT",
        token: session.token,
        body: { grossScore: Number(payload.grossScore), confirmed: true },
      });
      setMessage("Score guardado correctamente.");
      const teamSlug = detail?.slug || "big-6";
      const [board, tournament] = await Promise.all([
        api(`/api/leaderboards/${teamSlug}`),
        api(`/api/tournaments/${teamSlug}`),
      ]);
      setLeaderboard(board);
      setDetail(tournament);
    } catch (error) {
      setMessage(error.message || "No pudimos guardar el score.");
      throw error;
    } finally {
      setSaving(false);
    }
  }

  if (!session && !selectedEvent) {
    return (
      <AuthShell title="Equipo" subtitle="Selecciona el evento de tu equipo para iniciar sesion." showLogo={false}>
        <div className="team-login-selector">
          {SLUGS.map((item) => (
            <button
              className="event-login-card"
              key={item.slug}
              type="button"
              onClick={() => {
                navigateTo(`/equipo/${item.slug}/login`);
                setTeamRoute(parseTeamRoute());
              }}
            >
              <img src={item.logo} alt={item.label} />
              <span>Login {item.label}</span>
            </button>
          ))}
        </div>
      </AuthShell>
    );
  }

  if (!session) {
    return (
      <AuthShell
        title={`Equipo ${selectedEvent?.label || ""}`}
        subtitle="Ingresa con el usuario y password asignados para este evento."
        logo={selectedEvent?.logo}
      >
        <form className="stack" onSubmit={login}>
          <Field label="Usuario" value={form.username} onChange={(value) => setForm({ ...form, username: value })} />
          <Field label="Password" type="password" value={form.password} onChange={(value) => setForm({ ...form, password: value })} />
          {message && <p className="error-text">{message}</p>}
          <button className="button primary" type="submit">Entrar</button>
        </form>
      </AuthShell>
    );
  }

  const team = detail?.teams?.find((item) => item.id === session.teamId);
  return (
    <main className="app">
      <Hero
        eyebrow="Equipo"
        title={team?.name || "Editar marcador"}
        subtitle="Captura golpes por hoyo, confirma y sigue el leaderboard en vivo."
        logo={detail?.slug === "mid-6" ? "/assets/mid6-amarillo.png" : "/assets/big6-amarillo.png"}
      />
      <StatusBar online={online} leaderboard={leaderboard} />
      {message && <div className="notice band">{message}</div>}
      <section className="toolbar band team-session-bar">
        <span>{detail?.name || "Torneo del equipo"}</span>
        <button
          className="button subtle"
          type="button"
          onClick={() => {
            setSession(null);
            setDetail(null);
            setLeaderboard(null);
            navigateTo("/equipo/login", true);
            setTeamRoute(parseTeamRoute());
          }}
        >
          Cerrar sesión
        </button>
      </section>
      <section className="dashboard-grid scoring-grid">
        <Panel title="Editar marcador" kicker={detail?.isClosed ? "Torneo cerrado" : "Torneo activo"} className="score-panel">
          <ScoreEditor
            tournament={detail}
            team={team}
            disabled={detail?.isClosed || saving}
            onConfirm={submitScore}
          />
        </Panel>
        <Panel title="Leaderboard" kicker="En vivo">
          <LeaderboardTable data={leaderboard} compact />
        </Panel>
      </section>
    </main>
  );
}

function AdminApp() {
  const adminPath = window.location.pathname;
  const isStartingEventPage = adminPath.includes("/evento-de-salidas");
  const [session, setSession] = useStoredSession("admin-session");
  const [form, setForm] = useState({ username: "admin", password: "" });
  const [slug, setSlug] = useState("big-6");
  const [detail, setDetail] = useState(null);
  const [leaderboard, setLeaderboard] = useState(null);
  const [tournamentDraft, setTournamentDraft] = useState(null);
  const [podiumDraft, setPodiumDraft] = useState({ firstTeamId: "", secondTeamId: "", thirdTeamId: "", firstPrize: 0, secondPrize: 0, thirdPrize: 0 });
  const [message, setMessage] = useState("");
  const [resetScoresStep, setResetScoresStep] = useState(0);
  const [resettingScores, setResettingScores] = useState(false);
  const [expandedTeamId, setExpandedTeamId] = useState(null);
  const [editingTeamId, setEditingTeamId] = useState(null);
  const [savingTeams, setSavingTeams] = useState(new Set());

  useEffect(() => {
    if (window.location.pathname === "/admin/login") navigateTo("/admin", true);
  }, []);

  useEffect(() => {
    setPageTitle(slug, isStartingEventPage ? "Evento de salidas" : "Admin");
  }, [isStartingEventPage, slug]);

  useEffect(() => {
    if (!session) return;
    refreshAdmin(slug, session.token, setDetail, setLeaderboard);
  }, [slug, session]);

  useEffect(() => {
    if (!session?.token) return;
    let cancelled = false;
    api("/api/me", { token: session.token })
      .then((data) => {
        if (!cancelled && data.role !== "Admin") {
          setSession(null);
          setMessage("Este acceso es solo para admin.");
        }
      })
      .catch((error) => {
        if (!cancelled && error.status === 401) {
          setSession(null);
          setMessage("Sesion expirada. Entra de nuevo para guardar cambios.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [session?.token, setSession]);

  useEffect(() => {
    if (!detail) return;
    setTournamentDraft({
      name: detail.name || "",
      courseName: detail.courseName || "",
      startsAt: toDateTimeLocal(detail.startsAt),
      format: detail.format || "scramble",
      startMode: detail.startMode || "shotgun",
      status: detail.status || "upcoming",
      isClosed: Boolean(detail.isClosed),
      theme: detail.theme || "oscuro",
      holes: normalizeHoles(detail.holes),
    });
    setPodiumDraft({
      firstTeamId: detail.podium?.first?.teamId || "",
      secondTeamId: detail.podium?.second?.teamId || "",
      thirdTeamId: detail.podium?.third?.teamId || "",
      firstPrize: detail.podium?.first?.prize || 0,
      secondPrize: detail.podium?.second?.prize || 0,
      thirdPrize: detail.podium?.third?.prize || 0,
    });
  }, [detail]);

  async function login(event) {
    event.preventDefault();
    try {
      const data = await api("/api/auth/login", { method: "POST", body: form });
      if (data.role !== "Admin") throw new Error("Este acceso es solo para admin.");
      setSession(data);
      setMessage("");
    } catch (error) {
      setMessage(error.message || "No pudimos iniciar sesion.");
    }
  }

  async function updateStatus(status, isClosed) {
    await api(`/api/admin/tournaments/${slug}/status`, {
      method: "POST",
      token: session.token,
      body: { status, isClosed },
    });
    setMessage("Estado del torneo actualizado.");
    refreshAdmin(slug, session.token, setDetail, setLeaderboard);
  }

  async function resetTournamentScores() {
    setResettingScores(true);
    try {
      const data = await api(`/api/admin/tournaments/${slug}/reset-scores`, {
        method: "POST",
        token: session.token,
      });
      setResetScoresStep(0);
      setMessage(`Scores reiniciados. Se borraron ${data.deletedScores} scores.`);
      refreshAdmin(slug, session.token, setDetail, setLeaderboard);
    } catch (error) {
      setMessage(error.message || "No pudimos resetear el torneo.");
    } finally {
      setResettingScores(false);
    }
  }

  async function updateTeamCount(count) {
    const nextCount = Math.max(0, Math.min(22, count));
    await api(`/api/admin/tournaments/${slug}/team-count`, {
      method: "PUT",
      token: session.token,
      body: { count: nextCount },
    });
    setMessage(`Cantidad de equipos actualizada a ${nextCount}.`);
    refreshAdmin(slug, session.token, setDetail, setLeaderboard);
  }

  async function saveTeam(team) {
    setSavingTeams((current) => new Set([...current, team.id]));
    try {
      await api(`/api/admin/teams/${team.id}`, {
        method: "PUT",
        token: session.token,
        body: {
          name: team.name,
          startingHole: Number(team.startingHole) || 1,
          participants: team.handicaps ? serializeParticipantsWithHandicaps(team) : normalizeTeamParticipants(team.participants),
          judgeName: team.judgeName || "",
        },
      });
      setMessage(`Equipo ${team.name} guardado.`);
      await refreshAdmin(slug, session.token, setDetail, setLeaderboard);
    } catch (error) {
      if (error.status === 401) {
        setSession(null);
        setMessage("Sesion expirada. Entra de nuevo para guardar cambios.");
        return;
      }
      setMessage(error.message || "No pudimos guardar el equipo.");
    } finally {
      setSavingTeams((current) => {
        const next = new Set(current);
        next.delete(team.id);
        return next;
      });
    }
  }

  async function savePodium(event) {
    event.preventDefault();
    await api(`/api/admin/tournaments/${slug}/podium`, {
      method: "PUT",
      token: session.token,
      body: {
        firstTeamId: podiumDraft.firstTeamId ? Number(podiumDraft.firstTeamId) : null,
        secondTeamId: podiumDraft.secondTeamId ? Number(podiumDraft.secondTeamId) : null,
        thirdTeamId: podiumDraft.thirdTeamId ? Number(podiumDraft.thirdTeamId) : null,
        firstPrize: Number(podiumDraft.firstPrize) || 0,
        secondPrize: Number(podiumDraft.secondPrize) || 0,
        thirdPrize: Number(podiumDraft.thirdPrize) || 0,
      },
    });
    setMessage("Podio guardado.");
    refreshAdmin(slug, session.token, setDetail, setLeaderboard);
  }

  async function clearPodium() {
    await api(`/api/admin/tournaments/${slug}/podium`, {
      method: "PUT",
      token: session.token,
      body: {
        firstTeamId: null,
        secondTeamId: null,
        thirdTeamId: null,
        firstPrize: 0,
        secondPrize: 0,
        thirdPrize: 0,
      },
    });
    setPodiumDraft({ firstTeamId: "", secondTeamId: "", thirdTeamId: "", firstPrize: 0, secondPrize: 0, thirdPrize: 0 });
    setMessage("Podio limpiado.");
    refreshAdmin(slug, session.token, setDetail, setLeaderboard);
  }

  async function saveTournament(event) {
    event.preventDefault();
    await api(`/api/admin/tournaments/${slug}`, {
      method: "PUT",
      token: session.token,
      body: {
        ...tournamentDraft,
        startsAt: new Date(tournamentDraft.startsAt).toISOString(),
        holes: normalizeHoles(tournamentDraft.holes),
      },
    });
    setMessage("Informacion del torneo guardada.");
    refreshAdmin(slug, session.token, setDetail, setLeaderboard);
  }

  async function deleteTeam(teamId) {
    await api(`/api/admin/teams/${teamId}`, { method: "DELETE", token: session.token });
    setMessage("Equipo eliminado.");
    refreshAdmin(slug, session.token, setDetail, setLeaderboard);
  }

  async function copyTeamLogin(team) {
    const login = await api(`/api/admin/teams/${team.id}/login-copy`, {
      method: "POST",
      token: session.token,
    });

    const text = `Hola ${team.name}. Tu acceso como equipo participante para ${login.tournamentName} es:\nUsuario: ${login.username}\nContrasena: ${login.password}\nLink: ${window.location.origin}/equipo/${login.tournamentSlug}/login`;
    copyWithFallback(text);
    setMessage(`Login copiado para ${team.name}. Password: ${login.password}`);
  }

  if (!session) {
    return (
      <AuthShell title="Admin" subtitle="Control de torneos, equipos, usuarios y resultados.">
        <form className="stack" onSubmit={login}>
          <Field label="Usuario" value={form.username} onChange={(value) => setForm({ ...form, username: value })} />
          <Field label="Password" type="password" value={form.password} onChange={(value) => setForm({ ...form, password: value })} />
          {message && <p className="error-text">{message}</p>}
          <button className="button primary" type="submit">Entrar</button>
        </form>
      </AuthShell>
    );
  }

  return (
    <main className="app">
      <Hero
        eyebrow="Panel admin"
        title="BIG 6 / MID 6 Live Scoring"
        subtitle="Gestion de torneos, equipos, scores y cierre."
        logo={slug === "mid-6" ? "/assets/mid6-amarillo.png" : "/assets/big6-amarillo.png"}
      />
      {message && <div className="notice band">{message}</div>}
      <section className="toolbar band">
        <TournamentTabs value={slug} onChange={setSlug} />
        <details className="admin-actions-menu">
          <summary className="button subtle">Acciones</summary>
          <div className="admin-actions-panel">
            <button className="button subtle" onClick={() => refreshAdmin(slug, session.token, setDetail, setLeaderboard)}>Refrescar</button>
            <button className={isStartingEventPage ? "button primary" : "button subtle"} onClick={() => navigateTo(isStartingEventPage ? "/admin" : "/admin/evento-de-salidas")}>Evento de salidas</button>
            <button className="button subtle" onClick={() => updateStatus("active", false)}>Iniciar</button>
            <button className="button subtle" onClick={() => updateStatus("paused", false)}>Pausar</button>
            <button className="button subtle" onClick={() => updateStatus("active", false)}>Reabrir</button>
            <button className="button danger" onClick={() => updateStatus("finished", true)}>Finalizar torneo</button>
            <button className="button danger ghost" onClick={() => setResetScoresStep(1)}>Resetear torneo</button>
          </div>
        </details>
      </section>
      {resetScoresStep > 0 && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal-card">
            <span>{resetScoresStep === 1 ? "Confirmacion requerida" : "Confirmacion final"}</span>
            <h2>{resetScoresStep === 1 ? "Resetear torneo" : "Borrar scores"}</h2>
            <p>
              {resetScoresStep === 1
                ? `Estas seguro que quieres borrar los scores de todos los equipos de ${detail?.name || "este torneo"}?`
                : "Esta accion no se puede deshacer. Confirma una vez mas para borrar todos los scores guardados."}
            </p>
            <div className="toolbar-actions">
              <button className="button subtle" type="button" onClick={() => setResetScoresStep(0)} disabled={resettingScores}>Cancelar</button>
              {resetScoresStep === 1 ? (
                <button className="button danger" type="button" onClick={() => setResetScoresStep(2)}>Si, continuar</button>
              ) : (
                <button className="button danger" type="button" onClick={resetTournamentScores} disabled={resettingScores}>
                  {resettingScores ? "Borrando..." : "Si, borrar scores"}
                </button>
              )}
            </div>
          </section>
        </div>
      )}
      {isStartingEventPage ? (
        <EventoSalidasAdmin
          detail={detail}
          onBack={() => navigateTo("/admin")}
          onSave={saveTeam}
          savingTeams={savingTeams}
          slug={slug}
        />
      ) : (
      <section className="admin-grid">
        <Panel title="Torneo" kicker={detail?.name || "Configuracion"}>
          {tournamentDraft && (
            <form className="stack" onSubmit={saveTournament}>
              <div className="participants-grid">
                <Field label="Nombre del torneo" value={tournamentDraft.name} onChange={(value) => setTournamentDraft({ ...tournamentDraft, name: value })} />
                <Field label="Campo de golf" value={tournamentDraft.courseName} onChange={(value) => setTournamentDraft({ ...tournamentDraft, courseName: value })} />
                <Field label="Fecha y hora de inicio" type="datetime-local" value={tournamentDraft.startsAt} onChange={(value) => setTournamentDraft({ ...tournamentDraft, startsAt: value })} />
                <Field label="Formato" value={tournamentDraft.format} onChange={(value) => setTournamentDraft({ ...tournamentDraft, format: value })} />
                <Field label="Salida" value={tournamentDraft.startMode} onChange={(value) => setTournamentDraft({ ...tournamentDraft, startMode: value })} />
                <Field label="Tema" value={tournamentDraft.theme} onChange={(value) => setTournamentDraft({ ...tournamentDraft, theme: value })} />
                <SelectField label="Estado" value={tournamentDraft.status} onChange={(value) => setTournamentDraft({ ...tournamentDraft, status: value })}>
                  <option value="upcoming">Proximo</option>
                  <option value="active">Activo</option>
                  <option value="paused">Pausado</option>
                  <option value="finished">Finalizado</option>
                </SelectField>
                <label className="check-field">
                  <input
                    type="checkbox"
                    checked={tournamentDraft.isClosed}
                    onChange={(event) => setTournamentDraft({ ...tournamentDraft, isClosed: event.target.checked })}
                  />
                  <span>Torneo cerrado</span>
                </label>
              </div>
              <button className="button primary" type="submit">Guardar torneo</button>
            </form>
          )}
        </Panel>
        <Panel title="Setup" kicker="Front 9 / Back 9">
          {tournamentDraft && (
            <form className="stack" onSubmit={saveTournament}>
              <div className="hole-setup-grid">
                <HoleSetupGroup
                  title="Front 9"
                  holes={tournamentDraft.holes.slice(0, 9)}
                  onParChange={(number, par) => updateHolePar(tournamentDraft, setTournamentDraft, number, par)}
                />
                <HoleSetupGroup
                  title="Back 9"
                  holes={tournamentDraft.holes.slice(9, 18)}
                  onParChange={(number, par) => updateHolePar(tournamentDraft, setTournamentDraft, number, par)}
                />
              </div>
              <button className="button primary" type="submit">Guardar setup</button>
            </form>
          )}
        </Panel>
        <Panel title="Podio" kicker="Ganadores oficiales" className="podium-panel">
          <form className="stack" onSubmit={savePodium}>
            <div className="podium-admin-grid">
              <PodiumAdminPlace
                label="Primer lugar"
                teamValue={podiumDraft.firstTeamId}
                prizeValue={podiumDraft.firstPrize}
                teams={detail?.teams || []}
                onTeamChange={(value) => setPodiumDraft({ ...podiumDraft, firstTeamId: value })}
                onPrizeChange={(value) => setPodiumDraft({ ...podiumDraft, firstPrize: value })}
              />
              <PodiumAdminPlace
                label="Segundo lugar"
                teamValue={podiumDraft.secondTeamId}
                prizeValue={podiumDraft.secondPrize}
                teams={detail?.teams || []}
                onTeamChange={(value) => setPodiumDraft({ ...podiumDraft, secondTeamId: value })}
                onPrizeChange={(value) => setPodiumDraft({ ...podiumDraft, secondPrize: value })}
              />
              <PodiumAdminPlace
                label="Tercer lugar"
                teamValue={podiumDraft.thirdTeamId}
                prizeValue={podiumDraft.thirdPrize}
                teams={detail?.teams || []}
                onTeamChange={(value) => setPodiumDraft({ ...podiumDraft, thirdTeamId: value })}
                onPrizeChange={(value) => setPodiumDraft({ ...podiumDraft, thirdPrize: value })}
              />
            </div>
            <div className="toolbar-actions wrap">
              <button className="button primary" type="submit">Guardar podio</button>
              <button className="button subtle" type="button" onClick={clearPodium}>Limpiar podio</button>
            </div>
          </form>
        </Panel>
        <Panel title="Equipos" kicker={`${detail?.teams?.length || 0} de 22 espacios`} className="teams-panel">
          <div className="team-count-control">
            <button className="button subtle" type="button" onClick={() => updateTeamCount((detail?.teams?.length || 0) - 1)} disabled={(detail?.teams?.length || 0) <= 0}>-</button>
            <strong>{detail?.teams?.length || 0}</strong>
            <button className="button primary" type="button" onClick={() => updateTeamCount((detail?.teams?.length || 0) + 1)} disabled={(detail?.teams?.length || 0) >= 22}>+</button>
          </div>
          <div className="team-list">
            {detail?.teams?.map((team) => (
              <TeamAdminCard
                expanded={expandedTeamId === team.id}
                editing={editingTeamId === team.id}
                key={team.id}
                onCopyLogin={copyTeamLogin}
                onEdit={() => {
                  setEditingTeamId(editingTeamId === team.id ? null : team.id);
                  setExpandedTeamId(null);
                }}
                onExpand={() => {
                  setExpandedTeamId(expandedTeamId === team.id ? null : team.id);
                  setEditingTeamId(null);
                }}
                onSave={saveTeam}
                saving={savingTeams.has(team.id)}
                team={team}
              />
            ))}
          </div>
        </Panel>
        <Panel title="Leaderboard" kicker="Orden oficial">
          <LeaderboardTable data={leaderboard} compact />
        </Panel>
      </section>
      )}
    </main>
  );
}

function EventoSalidasAdmin({ detail, onBack, onSave, savingTeams, slug }) {
  const teams = [...(detail?.teams || [])].sort((a, b) => a.id - b.id);
  const assignedTeams = teams.filter(isTeamAssignedForStartingEvent);
  const allAssigned = teams.length >= 22 && assignedTeams.length >= 22;
  const logo = slug === "mid-6" ? "/assets/mid6-amarillo.png" : "/assets/big6-amarillo.png";
  const [activeIndex, setActiveIndex] = useState(0);
  const [carouselDirection, setCarouselDirection] = useState("next");
  const activeTeam = teams[activeIndex] || teams[0];
  const previousTeam = activeIndex > 0 ? teams[activeIndex - 1] : null;
  const nextTeam = activeIndex < teams.length - 1 ? teams[activeIndex + 1] : null;

  useEffect(() => {
    if (activeIndex > Math.max(0, teams.length - 1)) {
      setActiveIndex(Math.max(0, teams.length - 1));
    }
  }, [activeIndex, teams.length]);

  function goToNext() {
    setCarouselDirection("next");
    setActiveIndex((current) => Math.min(teams.length - 1, current + 1));
  }

  function goToPrevious() {
    setCarouselDirection("previous");
    setActiveIndex((current) => Math.max(0, current - 1));
  }

  return (
    <section className="starting-event-view">
      <div className="starting-event-header band">
        <div>
          <p>Evento de salidas</p>
          <h2>{detail?.name || "Torneo"}</h2>
          <span>{assignedTeams.length} de 22 equipos asignados</span>
        </div>
        <div className="toolbar-actions wrap">
          <button className="button subtle" type="button" onClick={onBack}>Volver al admin</button>
        </div>
      </div>

      {allAssigned ? (
        <div className="starting-compact-list">
          {teams.map((team) => (
            <StartingTeamCompactCard key={team.id} team={team} tournamentName={detail?.name} />
          ))}
        </div>
      ) : (
        <div className={`starting-carousel ${carouselDirection === "previous" ? "from-left" : "from-right"}`}>
          <div className="starting-carousel-stage">
            {previousTeam && (
              <StartingTeamPreviewCard
                index={activeIndex - 1}
                key={previousTeam.id}
                logo={logo}
                side="left"
                team={previousTeam}
                tournamentName={detail?.name}
              />
            )}
            {nextTeam && (
              <StartingTeamPreviewCard
                index={activeIndex + 1}
                key={nextTeam.id}
                logo={logo}
                side="right"
                team={nextTeam}
                tournamentName={detail?.name}
              />
            )}
            {activeTeam && (
            <StartingTeamAssignCard
              index={activeIndex}
              logo={logo}
              onNext={goToNext}
              onPrevious={goToPrevious}
              onSave={onSave}
              saving={savingTeams.has(activeTeam.id)}
              team={activeTeam}
              total={teams.length}
              tournamentName={detail?.name}
            />
            )}
          </div>
          <div className="starting-carousel-actions">
            <button className="button subtle" type="button" onClick={goToPrevious} disabled={activeIndex === 0}>Anterior</button>
            <span>{Math.min(activeIndex + 1, teams.length)} / {teams.length}</span>
            <button className="button primary" type="button" onClick={goToNext} disabled={activeIndex >= teams.length - 1}>Siguiente</button>
          </div>
        </div>
      )}
    </section>
  );
}

function StartingTeamAssignCard({ index, logo, onNext, onPrevious, onSave, saving, team, total, tournamentName }) {
  const [draft, setDraft] = useState(() => teamToStartingEventDraft(team));
  const handicapRefs = useRef([]);
  const participantRefs = useRef([]);

  useEffect(() => {
    setDraft(teamToStartingEventDraft(team));
  }, [team]);

  function updateParticipant(participantIndex, value) {
    const participants = [...draft.participants];
    participants[participantIndex] = value;
    setDraft({ ...draft, participants });
  }

  function updateHandicap(participantIndex, value) {
    const handicaps = [...draft.handicaps];
    handicaps[participantIndex] = value;
    setDraft({ ...draft, handicaps });
    if (/^\d+(\.\d+)$/.test(value.trim()) && participantIndex < draft.handicaps.length - 1) {
      requestAnimationFrame(() => participantRefs.current[participantIndex + 1]?.focus());
    }
  }

  const handicapTotal = calculateHandicapTotal(draft.handicaps);

  return (
    <article className="starting-assign-card active">
      <div className="starting-card-title">
        <img src={logo} alt="" />
        <div>
          <p>{tournamentName || "Torneo"}</p>
          <span>Equipo {index + 1} de {total}</span>
        </div>
        <div className="starting-handicap-total">
          <span>Handicap total</span>
          <strong>{formatHandicapTotal(handicapTotal)}</strong>
        </div>
      </div>
      <div className="starting-card-main">
        <label className="starting-team-name-field">
          <input
            placeholder="Team name"
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        </label>
        <Field
          label="Hoyo de salida"
          placeholder="Hoyo de salida"
          type="number"
          value={draft.startingHole}
          onChange={(value) => setDraft({ ...draft, startingHole: value })}
        />
      </div>
      <div className="starting-participants-box">
        {draft.participants.map((value, participantIndex) => (
          <label className="starting-player-field" key={participantIndex}>
            <span>Jugador {participantIndex + 1}</span>
            <input
              placeholder={`Participante ${participantIndex + 1}`}
              ref={(node) => { participantRefs.current[participantIndex] = node; }}
              value={value}
              onChange={(event) => updateParticipant(participantIndex, event.target.value)}
            />
            <input
              inputMode="decimal"
              maxLength="4"
              placeholder="00.0"
              ref={(node) => { handicapRefs.current[participantIndex] = node; }}
              value={draft.handicaps[participantIndex] || ""}
              onChange={(event) => updateHandicap(participantIndex, event.target.value)}
            />
          </label>
        ))}
      </div>
      <div className="starting-card-footer">
        <button className="button subtle" type="button" onClick={onPrevious} disabled={index === 0}>Anterior</button>
        <button className="button primary" type="button" onClick={() => onSave(draft)} disabled={saving}>
          {saving ? "Guardando..." : "Guardar asignacion"}
        </button>
        <button className="button subtle" type="button" onClick={onNext} disabled={index >= total - 1}>Siguiente</button>
      </div>
    </article>
  );
}

function StartingTeamPreviewCard({ index, logo, side, team, tournamentName }) {
  const draft = teamToStartingEventDraft(team);
  const handicapTotal = calculateHandicapTotal(draft.handicaps);
  return (
    <article className={`starting-assign-card preview ${side === "left" ? "preview-left" : "preview-right"}`}>
      <div className="starting-card-title">
        <img src={logo} alt="" />
        <div>
          <p>{tournamentName || "Torneo"}</p>
          <span>Equipo {index + 1}</span>
        </div>
        <div className="starting-handicap-total">
          <span>Handicap total</span>
          <strong>{formatHandicapTotal(handicapTotal)}</strong>
        </div>
      </div>
      <div className="starting-card-main">
        <div className="starting-readonly-box team-name-preview">
          <strong>{team.name || "Team name"}</strong>
        </div>
        <div className="starting-readonly-box">
          <span>Hoyo de salida</span>
          <strong>{draft.startingHole || ""}</strong>
        </div>
      </div>
      <div className="starting-participants-box readonly">
        {draft.participants.map((value, participantIndex) => (
          <div className="starting-readonly-box player-preview" key={participantIndex}>
            <span>Jugador {participantIndex + 1}</span>
            <strong>{value || ""}</strong>
            <em>{draft.handicaps[participantIndex] || ""}</em>
          </div>
        ))}
      </div>
    </article>
  );
}

function StartingTeamCompactCard({ team, tournamentName }) {
  const participants = normalizeTeamParticipants(team.participants);
  return (
    <article className="starting-compact-card">
      <div>
        <p>{tournamentName || "Torneo"}</p>
        <strong>{team.name}</strong>
        <span>{participants.filter(Boolean).join(" - ")}</span>
      </div>
      <b>Hoyo {team.startingHole}</b>
    </article>
  );
}

function TeamAdminCard({ editing, expanded, onCopyLogin, onEdit, onExpand, onSave, saving, team }) {
  const [draft, setDraft] = useState(() => teamToDraft(team));

  useEffect(() => {
    setDraft(teamToDraft(team));
  }, [team]);

  function updateParticipant(index, value) {
    const participants = [...draft.participants];
    participants[index] = value;
    setDraft({ ...draft, participants });
  }

  const startingDraft = teamToStartingEventDraft(team);
  const handicapTotal = calculateHandicapTotal(startingDraft.handicaps);
  const playerCount = startingDraft.participants.filter((name) => name.trim()).length;

  return (
    <article className={`team-row team-admin-card ${expanded || editing ? "expanded" : ""}`}>
      <div className="team-admin-summary">
        <div className="team-admin-overview">
          <strong>{team.name}</strong>
          <span>Hoyo de salida {team.startingHole || "-"}</span>
          <span>{playerCount} jugadores</span>
        </div>
        <div className="team-admin-handicap">
          <span>Handicap</span>
          <strong>{formatHandicapTotal(handicapTotal)}</strong>
        </div>
        <button className="button subtle" type="button" onClick={() => onCopyLogin(team)}>Copiar login</button>
        <button className="button primary" type="button" onClick={onEdit}>Editar equipo</button>
        <button className="button subtle" type="button" onClick={onExpand}>{expanded ? "Ocultar detalles" : "Ver detalles"}</button>
      </div>
      {expanded && (
        <div className="team-admin-details">
          {startingDraft.participants.map((name, index) => (
            <div className="team-admin-detail" key={index}>
              <span>Jugador {index + 1}</span>
              <strong>{name || "-"}</strong>
              <em>{startingDraft.handicaps[index] || ""}</em>
            </div>
          ))}
          {team.judgeName && (
            <div className="team-admin-detail">
              <span>El juez</span>
              <strong>{team.judgeName}</strong>
            </div>
          )}
        </div>
      )}
      {editing && (
        <div className="team-admin-expanded">
          <div className="participants-grid">
            <Field label="Nombre del equipo" value={draft.name} onChange={(value) => setDraft({ ...draft, name: value })} />
            <Field label="Hoyo de salida" type="number" value={draft.startingHole} onChange={(value) => setDraft({ ...draft, startingHole: Number(value) })} />
          </div>
          <div className="participants-grid">
            {draft.participants.map((value, index) => (
              <Field key={index} label={`Jugador ${index + 1}`} value={value} onChange={(next) => updateParticipant(index, next)} />
            ))}
            <Field label="El juez (opcional)" value={draft.judgeName} onChange={(value) => setDraft({ ...draft, judgeName: value })} />
          </div>
          <div className="toolbar-actions wrap">
            <button className="button primary" type="button" onClick={() => onSave(draft)} disabled={saving}>
              {saving ? "Guardando..." : "Guardar equipo"}
            </button>
            <span className="team-login-note">Password autogenerado con un jugador famoso del PGA al copiar login.</span>
          </div>
        </div>
      )}
    </article>
  );
}

function ScoreEditor({ tournament, team, disabled, onConfirm }) {
  const scores = new Map((team?.scores || []).map((item) => [item.holeNumber, item]));
  const orderedHoles = orderHolesFromStart(tournament?.holes || [], team?.startingHole || 1);
  const [activeIndex, setActiveIndex] = useState(0);
  const [grossScore, setGrossScore] = useState("");
  const [isFlinging, setIsFlinging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [pointerStart, setPointerStart] = useState(null);
  const [transitionNextHole, setTransitionNextHole] = useState(null);
  const activeHole = orderedHoles[activeIndex] || orderedHoles[0];
  const nextHole = orderedHoles[activeIndex + 1] || null;
  const activeScore = activeHole ? scores.get(activeHole.number) : null;
  const completedCount = orderedHoles.filter((hole) => scores.has(hole.number)).length;
  const tournamentLogo = tournament?.slug === "mid-6" ? "/assets/mid6-amarillo.png" : "/assets/big6-amarillo.png";

  useEffect(() => {
    setActiveIndex(0);
  }, [team?.id, team?.startingHole, tournament?.slug]);

  useEffect(() => {
    setGrossScore(activeScore?.grossScore ?? "");
  }, [activeHole?.number, activeScore?.grossScore]);

  function goPrevious() {
    setActiveIndex((index) => Math.max(0, index - 1));
  }

  function goNext() {
    setActiveIndex((index) => Math.min(orderedHoles.length - 1, index + 1));
  }

  function handleSave() {
    if (!activeHole || !grossScore) return;
    return onConfirm({
      holeNumber: activeHole.number,
      grossScore,
    });
  }

  function saveWithMotion() {
    if (disabled || !grossScore || isFlinging) return;
    setTransitionNextHole(nextHole);
    setIsFlinging(true);
    setDragOffset(0);
    window.setTimeout(() => {
      Promise.resolve(handleSave())
        .then(() => {
          setIsFlinging(false);
          setTransitionNextHole(null);
          goNext();
        })
        .catch(() => {
          setIsFlinging(false);
          setTransitionNextHole(null);
        });
    }, 260);
  }

  function shouldIgnoreSwipe(target) {
    return target.closest(".score-wheel-wrap, .score-actions, button, input, select, a");
  }

  function handlePointerDown(event) {
    if (disabled || !grossScore || isFlinging || shouldIgnoreSwipe(event.target)) return;
    setPointerStart({ x: event.clientX, y: event.clientY, id: event.pointerId });
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event) {
    if (!pointerStart || pointerStart.id !== event.pointerId || isFlinging) return;
    const deltaX = event.clientX - pointerStart.x;
    const deltaY = event.clientY - pointerStart.y;
    if (deltaX <= 0 || Math.abs(deltaY) > Math.abs(deltaX) * 1.35) {
      setDragOffset(0);
      return;
    }
    event.preventDefault();
    setDragOffset(Math.min(deltaX, 150));
  }

  function handlePointerEnd(event) {
    if (!pointerStart || pointerStart.id !== event.pointerId || isFlinging) return;
    const deltaX = event.clientX - pointerStart.x;
    const deltaY = event.clientY - pointerStart.y;
    setPointerStart(null);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (deltaX > 92 && Math.abs(deltaX) > Math.abs(deltaY) * 1.15) {
      saveWithMotion();
      return;
    }
    setDragOffset(0);
  }

  if (!activeHole) {
    return <p className="error-text">No hay hoyos configurados.</p>;
  }

  const previewHole = isFlinging && transitionNextHole ? transitionNextHole : nextHole;
  const previewScore = previewHole ? scores.get(previewHole.number) : null;
  const showPreviewCard = Boolean(previewHole);

  return (
    <div className="score-swipe">
      <div className={`score-card-stack ${isFlinging ? "is-advancing" : ""}`}>
        {showPreviewCard && (
          <section className="score-focus-card score-next-card" key={`next-${previewHole.number}`} aria-hidden="true">
            <div className="score-card-topline">
              <img src={tournamentLogo} alt="" />
              <strong>{completedCount} hoyos jugados</strong>
            </div>
            <div className="swipe-save-badge">Siguiente</div>
            <div className="score-hole-main">
              <span>Hoyo</span>
              <strong>{previewHole.number}</strong>
              <em>Par {previewHole.par}</em>
            </div>
            <ScoreWheel value={previewScore?.grossScore ?? ""} centerValue={previewHole.par} onChange={() => {}} disabled />
            <small>{previewScore ? `Guardado: ${previewScore.grossScore} (${scoreLabel(previewScore.grossScore - previewHole.par)})` : "Pendiente"}</small>
            <div className="score-actions">
              <button className="button subtle" type="button" disabled>Volver atras</button>
              <button className="button primary" type="button" disabled>Guardar score</button>
            </div>
          </section>
        )}
        <section
          key={`current-${activeHole.number}`}
          className={`score-focus-card score-current-card ${activeScore ? "complete" : ""} ${isFlinging ? "is-flinging" : ""}`}
          style={!isFlinging && dragOffset ? { transform: `translateX(${dragOffset}px) rotate(${dragOffset / 18}deg)` } : undefined}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={() => {
            setPointerStart(null);
            setDragOffset(0);
          }}
        >
          <div className="score-card-topline">
            <img src={tournamentLogo} alt="" />
            <strong>{completedCount} hoyos jugados</strong>
          </div>
          <div className="swipe-save-badge">Desliza para guardar</div>
          <div className="score-hole-main">
            <span>Hoyo</span>
            <strong>{activeHole.number}</strong>
            <em>Par {activeHole.par}</em>
          </div>
          <ScoreWheel value={grossScore} centerValue={activeHole.par} onChange={setGrossScore} disabled={disabled} />
          <small>{activeScore ? `Guardado: ${activeScore.grossScore} (${scoreLabel(activeScore.grossScore - activeHole.par)})` : "Pendiente"}</small>
          <div className="score-actions">
            <button className="button subtle" type="button" onClick={goPrevious} disabled={activeIndex === 0}>Volver atras</button>
            <button className="button primary" type="button" onClick={saveWithMotion} disabled={disabled || !grossScore}>Guardar score</button>
          </div>
        </section>
      </div>
      <div className="score-hole-strip" aria-label="Hoyos">
        {orderedHoles.map((hole, index) => (
          <button
            className={`${index === activeIndex ? "active" : ""} ${scores.has(hole.number) ? "complete" : ""}`}
            type="button"
            key={hole.number}
            onClick={() => setActiveIndex(index)}
          >
            {hole.number}
          </button>
        ))}
      </div>
    </div>
  );
}

function ScoreWheel({ value, centerValue, onChange, disabled }) {
  const wheelRef = useRef(null);
  const scrollTimer = useRef(null);
  const programmaticScroll = useRef(false);

  useEffect(() => () => {
    window.clearTimeout(scrollTimer.current);
  }, []);

  useEffect(() => {
    const target = value || centerValue;
    if (!target) return;
    snapToScore(String(target), "auto");
  }, [value, centerValue]);

  function getCenteredScore() {
    const wheel = wheelRef.current;
    if (!wheel) return String(value || SCORE_OPTIONS[0]);
    const wheelBox = wheel.getBoundingClientRect();
    const center = wheelBox.left + wheelBox.width / 2;
    let closest = SCORE_OPTIONS[0];
    let closestDistance = Number.POSITIVE_INFINITY;
    Array.from(wheel.children).forEach((child, index) => {
      const box = child.getBoundingClientRect();
      const distance = Math.abs(box.left + box.width / 2 - center);
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = SCORE_OPTIONS[index];
      }
    });
    return closest;
  }

  function snapToScore(score, behavior = "smooth") {
    const wheel = wheelRef.current;
    const index = SCORE_OPTIONS.indexOf(String(score));
    if (!wheel || index < 0) return;
    const item = wheel.children[index];
    const left = item.offsetLeft - (wheel.clientWidth - item.clientWidth) / 2;
    programmaticScroll.current = true;
    wheel.scrollTo({ left, behavior });
    window.clearTimeout(scrollTimer.current);
    scrollTimer.current = window.setTimeout(() => {
      programmaticScroll.current = false;
    }, behavior === "auto" ? 40 : 260);
  }

  function settleWheel() {
    if (programmaticScroll.current) return;
    const score = getCenteredScore();
    if (score !== String(value)) onChange(score);
    snapToScore(score, "smooth");
  }

  function handleScroll() {
    if (disabled || programmaticScroll.current) return;
    window.clearTimeout(scrollTimer.current);
    scrollTimer.current = window.setTimeout(settleWheel, 120);
  }

  function handleWheel(event) {
    if (disabled) return;
    const wheel = wheelRef.current;
    if (!wheel || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    event.preventDefault();
    wheel.scrollLeft += event.deltaY;
    handleScroll();
  }

  return (
    <div className="score-wheel-wrap">
      <span className="score-wheel-label">Golpes</span>
      <div className="score-wheel-marker" aria-hidden="true" />
      <div
        className="score-wheel"
        aria-label="Golpes"
        ref={wheelRef}
        onScroll={handleScroll}
        onWheel={handleWheel}
        onPointerUp={settleWheel}
        onTouchEnd={settleWheel}
      >
        {SCORE_OPTIONS.map((score) => (
          <button
            className={String(value) === score ? "active" : ""}
            type="button"
            key={score}
            disabled={disabled}
            onClick={() => onChange(score)}
          >
            {score}
          </button>
        ))}
      </div>
    </div>
  );
}

function Hero({ eyebrow, title, titleLogo, subtitle, logo }) {
  return (
    <section className="hero">
      {logo && (
        <div className="hero-logo">
          <img src={logo} alt="" />
        </div>
      )}
      <div className="hero-copy">
        <p>{eyebrow}</p>
        {titleLogo ? (
          <img className="hero-title-logo" src={titleLogo} alt={title} />
        ) : (
          <h1>{title}</h1>
        )}
        <span>{subtitle}</span>
      </div>
    </section>
  );
}

function StatusBar({ online, leaderboard }) {
  return (
    <section className="status-strip band">
      <span className={online ? "status-pill live" : "status-pill offline"}>
        {online ? "Conexion en linea" : "Sin conexion"}
      </span>
      <span>{translateStatus(leaderboard?.tournament?.status)}</span>
    </section>
  );
}

function TournamentTabs({ value, onChange }) {
  return (
    <div className="tabs">
      {SLUGS.map((item) => (
        <button className={value === item.slug ? "active" : ""} key={item.slug} onClick={() => onChange(item.slug)}>
          {item.label}
        </button>
      ))}
    </div>
  );
}

function LeaderboardTable({ data, compact = false, animateChanges = false }) {
  const rows = data?.rows || [];
  const previousRows = useRef(new Map());
  const [flashRows, setFlashRows] = useState(new Set());
  const [positionUpRows, setPositionUpRows] = useState(new Set());

  useEffect(() => {
    if (rows.length === 0) {
      previousRows.current = new Map(rows.map((row) => [row.teamId, row]));
      return;
    }

    const changedIds = [];
    const movedUpIds = [];
    for (const row of rows) {
      const previous = previousRows.current.get(row.teamId);
      if (!previous) continue;
      if (animateChanges && (previous.totalScore !== row.totalScore || previous.holesCompleted !== row.holesCompleted || previous.scoreLabel !== row.scoreLabel)) {
        changedIds.push(row.teamId);
      }
      if (previous.position && row.position && row.position < previous.position) {
        movedUpIds.push(row.teamId);
      }
    }

    previousRows.current = new Map(rows.map((row) => [row.teamId, row]));

    const timers = [];
    if (changedIds.length > 0) {
      setFlashRows(new Set(changedIds));
      timers.push(window.setTimeout(() => setFlashRows(new Set()), 300));
    }
    if (movedUpIds.length > 0) {
      setPositionUpRows(new Set(movedUpIds));
      timers.push(window.setTimeout(() => setPositionUpRows(new Set()), 650));
    }

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [animateChanges, rows]);

  return (
    <div className="table-wrap">
      <table className={compact ? "compact-table" : ""}>
        <thead>
          <tr>
            <th>Pos.</th>
            <th>Equipo</th>
            <th>Golpes</th>
            <th>Resultado</th>
            <th>Hoyos jugados</th>
            <th>Hoyo actual</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const rowClasses = [
              flashRows.has(row.teamId) ? "score-flash" : "",
              positionUpRows.has(row.teamId) ? "position-up" : "",
            ].filter(Boolean).join(" ");

            return (
            <tr className={rowClasses} key={row.teamId}>
              <td>{row.displayPosition ?? (row.holesCompleted > 0 ? (row.tied ? `T${row.position}` : row.position) : "")}</td>
              <td>
                <strong className="leader-team-name">{row.teamName}</strong>
                {row.participants?.length > 0 && (
                  <span className="leader-participants">{row.participants.join(" · ")}</span>
                )}
              </td>
              <td>{row.totalScore}</td>
              <td>{row.scoreLabel}</td>
              <td>{row.holesCompleted}</td>
              <td>{row.currentHole}</td>
            </tr>
          );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PodiumDisplay({ podium }) {
  const places = [
    { key: "second", label: "2", title: "Segundo", data: podium?.second },
    { key: "first", label: "1", title: "Primero", data: podium?.first },
    { key: "third", label: "3", title: "Tercero", data: podium?.third },
  ];
  const hasPodium = places.every((place) => place.data?.teamName);
  if (!hasPodium) return null;

  return (
    <section className="podium-strip" aria-label="Podio del torneo">
      {places.map((place) => (
        <article className={`podium-card ${place.key}`} key={place.key}>
          <span>{place.title}</span>
          <strong>{place.data?.teamName || "Por definir"}</strong>
          <em>{formatMoney(place.data?.prize || 0)}</em>
          <b>{place.label}</b>
        </article>
      ))}
    </section>
  );
}

function PodiumAdminPlace({ label, teamValue, prizeValue, teams, onTeamChange, onPrizeChange }) {
  return (
    <div className="podium-admin-card">
      <SelectField label={label} value={teamValue} onChange={onTeamChange}>
        <option value="">Sin definir</option>
        {teams.map((team) => (
          <option value={team.id} key={team.id}>{team.name}</option>
        ))}
      </SelectField>
      <Field label="Premio DOP" type="number" value={prizeValue} onChange={onPrizeChange} />
    </div>
  );
}

function HoleSetupGroup({ title, holes, onParChange }) {
  return (
    <section className="hole-setup-group">
      <h3>{title}</h3>
      <div className="hole-setup-header">
        <span>Hoyo</span>
        <span>Par</span>
      </div>
      {holes.map((hole) => (
        <div className="hole-setup-row" key={hole.number}>
          <strong>{hole.number}</strong>
          <input
            type="number"
            min="3"
            max="6"
            value={hole.par}
            onChange={(event) => onParChange(hole.number, Number(event.target.value))}
          />
        </div>
      ))}
    </section>
  );
}

function LeaderboardSkeleton() {
  return <div className="skeleton-list">{Array.from({ length: 6 }).map((_, index) => <span key={index} />)}</div>;
}

function AppLoadingScreen() {
  return (
    <div className="app-loader" role="status" aria-label="Cargando">
      <svg className="loader-six" viewBox="0 0 416 521" aria-hidden="true">
        <defs>
          <path id="loader-six-path" d={LOADING_SIX_PATH} />
          <clipPath id="loader-six-top-left"><rect x="0" y="0" width="208" height="260.5" /></clipPath>
          <clipPath id="loader-six-top-right"><rect x="208" y="0" width="208" height="260.5" /></clipPath>
          <clipPath id="loader-six-bottom-left"><rect x="0" y="260.5" width="208" height="260.5" /></clipPath>
          <clipPath id="loader-six-bottom-right"><rect x="208" y="260.5" width="208" height="260.5" /></clipPath>
        </defs>
        <g className="loader-six-pieces">
          <use href="#loader-six-path" className="loader-piece piece-one" clipPath="url(#loader-six-top-left)" />
          <use href="#loader-six-path" className="loader-piece piece-two" clipPath="url(#loader-six-top-right)" />
          <use href="#loader-six-path" className="loader-piece piece-three" clipPath="url(#loader-six-bottom-left)" />
          <use href="#loader-six-path" className="loader-piece piece-four" clipPath="url(#loader-six-bottom-right)" />
        </g>
        <use href="#loader-six-path" className="loader-six-final" />
      </svg>
    </div>
  );
}

function Panel({ title, kicker, children, className = "" }) {
  return (
    <section className={`panel ${className}`.trim()}>
      <header>
        <p>{kicker}</p>
        <h2>{title}</h2>
      </header>
      {children}
    </section>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value || "-"}</strong>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder = "" }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SelectField({ label, value, onChange, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  );
}

function AuthShell({ title, subtitle, logo = "/assets/big6-amarillo.png", showLogo = true, children }) {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        {showLogo && <img src={logo} alt="" />}
        <p>BIG 6 / MID 6 Live Scoring</p>
        <h1>{title}</h1>
        <span>{subtitle}</span>
        {children}
      </section>
    </main>
  );
}

async function refreshAdmin(slug, token, setDetail, setLeaderboard) {
  const [detail, leaderboard] = await Promise.all([
    api(`/api/tournaments/${slug}`),
    api(`/api/leaderboards/${slug}`),
  ]);
  setDetail(detail);
  setLeaderboard(leaderboard);
}

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    let message = "Ocurrio un error inesperado.";
    try {
      const payload = await response.json();
      message = payload.error || payload.title || message;
    } catch {
      if (response.status === 401) message = "Credenciales invalidas.";
      if (response.status === 403) message = "No tienes permiso para esta accion.";
    }
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  if (response.status === 204) return null;
  return response.json();
}

function useStoredSession(key) {
  const [session, setSession] = useState(() => {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  });
  useEffect(() => {
    if (session) window.localStorage.setItem(key, JSON.stringify(session));
    else window.localStorage.removeItem(key);
  }, [key, session]);
  return [session, setSession];
}

function useOnlineStatus() {
  const [online, setOnline] = useState(window.navigator.onLine);
  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);
  return online;
}

function translateStatus(status) {
  return {
    upcoming: "Proximo",
    active: "Torneo activo",
    paused: "Torneo pausado",
    finished: "Torneo finalizado",
  }[status] || "Sin estado";
}

function scoreLabel(score) {
  if (score === 0) return "E";
  return score > 0 ? `+${score}` : `${score}`;
}

function formatDate(value) {
  return value ? new Intl.DateTimeFormat("es-DO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "-";
}

function formatMoney(value) {
  return new Intl.NumberFormat("es-DO", {
    style: "currency",
    currency: "DOP",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function formatHandicapTotal(value) {
  const rounded = Math.round((Number(value) || 0) * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function calculateHandicapTotal(handicaps) {
  return normalizeTeamParticipants(handicaps || []).reduce((sum, value) => {
    const cleanValue = String(value || "").trim();
    if (!cleanValue) return sum;
    const numericValue = Number.parseFloat(cleanValue);
    if (!Number.isFinite(numericValue)) return sum;
    return sum + (cleanValue.startsWith("+") || cleanValue.startsWith("-") ? -Math.abs(numericValue) : numericValue);
  }, 0);
}

function teamToDraft(team) {
  return {
    id: team.id,
    name: team.name || "",
    startingHole: team.startingHole || 1,
    participants: normalizeTeamParticipants(team.participants || []),
    judgeName: team.judgeName || "",
  };
}

function teamToStartingEventDraft(team) {
  const participants = normalizeTeamParticipants(team.participants || []).map((name, index) => {
    const value = parseParticipantName(name || "");
    return value.trim().toLowerCase() === `jugador ${index + 1}` ? "" : value;
  });
  const fallbackHandicaps = normalizeTeamParticipants(team.participants || []).map((value) => parseParticipantHandicap(value || ""));
  const handicaps = normalizeTeamParticipants(team.participantHandicaps || fallbackHandicaps).map((value) => value || "");
  const isDefaultSlot = /^(BIG|MID) Equipo \d+$/i.test((team.name || "").trim()) && participants.every((name) => !name.trim());
  return {
    id: team.id,
    name: team.name || "",
    startingHole: isDefaultSlot ? "" : (team.startingHole || ""),
    participants,
    handicaps,
    judgeName: team.judgeName || "",
  };
}

function isTeamAssignedForStartingEvent(team) {
  const participants = normalizeTeamParticipants(team.participants);
  const hasRealName = Boolean(team.name?.trim()) && !/^(BIG|MID) Equipo \d+$/i.test(team.name.trim());
  const hasStartingHole = Number(team.startingHole) >= 1 && Number(team.startingHole) <= 18;
  const hasSixPlayers = participants.every((name, index) => {
    const value = name.trim();
    return value.length > 0 && value.toLowerCase() !== `jugador ${index + 1}`;
  });
  return hasRealName && hasStartingHole && hasSixPlayers;
}

function normalizeTeamParticipants(participants) {
  return Array.from({ length: 6 }, (_, index) => participants[index] || "");
}

function serializeParticipantsWithHandicaps(team) {
  const participants = normalizeTeamParticipants(team.participants || []);
  const handicaps = normalizeTeamParticipants(team.handicaps || []);
  return participants.map((name, index) => {
    const cleanName = (name || "").trim();
    const cleanHandicap = (handicaps[index] || "").trim();
    if (!cleanName) return "";
    return cleanHandicap ? `${cleanName}::HCP:${cleanHandicap}` : cleanName;
  });
}

function parseParticipantName(value) {
  const markerIndex = String(value).toLowerCase().indexOf("::hcp:");
  return markerIndex < 0 ? String(value) : String(value).slice(0, markerIndex).trim();
}

function parseParticipantHandicap(value) {
  const rawValue = String(value);
  const markerIndex = rawValue.toLowerCase().indexOf("::hcp:");
  return markerIndex < 0 ? "" : rawValue.slice(markerIndex + "::HCP:".length).trim();
}

function toDateTimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 16);
}

function normalizeHoles(holes = []) {
  const byNumber = new Map(holes.map((hole) => [Number(hole.number), Number(hole.par) || 4]));
  return Array.from({ length: 18 }, (_, index) => {
    const number = index + 1;
    return { number, par: byNumber.get(number) || 4 };
  });
}

function updateHolePar(tournamentDraft, setTournamentDraft, number, par) {
  setTournamentDraft({
    ...tournamentDraft,
    holes: normalizeHoles(tournamentDraft.holes).map((hole) => (
      hole.number === number ? { ...hole, par } : hole
    )),
  });
}

function orderHolesFromStart(holes, startingHole) {
  const normalized = normalizeHoles(holes);
  const start = Math.min(18, Math.max(1, Number(startingHole) || 1));
  return [...normalized.filter((hole) => hole.number >= start), ...normalized.filter((hole) => hole.number < start)];
}

function exportCsv(leaderboard) {
  const rows = leaderboard?.rows || [];
  const csv = [
    ["Posicion", "Equipo", "Golpes", "Resultado", "Hoyos jugados", "Hoyo actual"],
    ...rows.map((row) => [row.displayPosition ?? row.position ?? "", row.teamName, row.totalScore, row.scoreLabel, row.holesCompleted, row.currentHole]),
  ].map((row) => row.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "resultados-big6-mid6.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function copyWithFallback(value) {
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!copied) throw new Error("copy-failed");
}
