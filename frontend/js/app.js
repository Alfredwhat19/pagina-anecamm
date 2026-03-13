const STORAGE_KEY = "anecamm_clubes";
const form = document.getElementById("clubForm");
const directoryBody = document.getElementById("directoryBody");
const statusMsg = document.getElementById("statusMsg");
const clearBtn = document.getElementById("clearData");
const directorySearch = document.getElementById("directorySearch");
const carousels = Array.from(document.querySelectorAll(".js-carousel"));
const nav = document.getElementById("mainNav");
const menuToggle = document.getElementById("menuToggle");
const checkoutLink = form?.querySelector('a.btn[href]');
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const CERT_TEMPLATE_URL = "../assets/templates/formato-afiliacion.html";
const USE_SIMPLE_CERTIFICATE_HTML = false;
const CERT_DOWNLOAD_KEY_PREFIX = "anecamm_cert_downloaded_";
const CERT_SIGNED_BY = "Firmado por ANECAMM por Arjan Oliver Guerrero Díaz";

let directoryQuery = "";
let directoryData = [];
let isSubmittingCheckout = false;

const showStatus = (message, isError = false) => {
  if (!statusMsg) return;
  statusMsg.textContent = message;
  statusMsg.classList.toggle("error", isError);
};

const parsePaidAt = (paidAt) => {
  if (!paidAt || typeof paidAt !== "string") return null;
  const normalized = paidAt.includes("T") ? paidAt : paidAt.replace(" ", "T");
  const hasTimezone = /Z|[+-]\d{2}:?\d{2}$/.test(normalized);
  const withTimezone = hasTimezone ? normalized : `${normalized}Z`;
  const parsed = new Date(withTimezone);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatEsDate = (date) =>
  new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);

const buildDocumentId = (clubId, createdAt) => {
  const datePart = createdAt.toISOString().slice(0, 10).replace(/-/g, "");
  return `ANECAMM-${clubId}-${datePart}`;
};

const applyTemplateReplacements = (template, replacements) =>
  Object.entries(replacements).reduce(
    (html, [key, value]) => html.split(key).join(value),
    template
  );

const createPdfRenderContainer = (html) => {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(html, "text/html");
  const styles = Array.from(parsed.querySelectorAll("style"))
    .map((style) => style.textContent || "")
    .join("\n");
  const pdfOverrides = `
    .pdf24_view {
      font-size: 1em !important;
      transform: none !important;
      -webkit-transform: none !important;
      -moz-transform: none !important;
      transform-origin: top left !important;
      -webkit-transform-origin: top left !important;
      -moz-transform-origin: top left !important;
    }

    .pdf24_02 {
      width: 45em !important;
      height: 60em !important;
      overflow: hidden !important;
      box-shadow: none !important;
      margin: 0 !important;
    }

    body > div {
      box-shadow: none !important;
      margin: 0 !important;
    }
  `;

  const renderRoot = document.createElement("div");
  renderRoot.setAttribute("aria-hidden", "true");
  renderRoot.style.position = "absolute";
  renderRoot.style.top = "0";
  renderRoot.style.left = "0";
  renderRoot.style.width = "8.5in";
  renderRoot.style.maxWidth = "8.5in";
  renderRoot.style.minHeight = "11in";
  renderRoot.style.height = "auto";
  renderRoot.style.background = "#ffffff";
  renderRoot.style.zIndex = "-1";
  renderRoot.style.opacity = "0";
  renderRoot.style.pointerEvents = "none";
  renderRoot.style.transform = "none";
  renderRoot.style.visibility = "visible";
  renderRoot.style.display = "block";
  renderRoot.style.overflow = "visible";

  const styleTag = document.createElement("style");
  styleTag.textContent = `${styles}\n${pdfOverrides}`;

  const content = parsed.body;
  const wrapper = document.createElement("div");
  wrapper.className = "pdf-content";
  wrapper.style.width = "8.5in";
  wrapper.style.maxWidth = "8.5in";
  wrapper.style.minHeight = "11in";
  wrapper.style.background = "#ffffff";
  wrapper.style.overflow = "visible";
  renderRoot._pdfContent = wrapper;
  wrapper.innerHTML = content.innerHTML;

  renderRoot.appendChild(styleTag);
  renderRoot.appendChild(wrapper);

  document.body.appendChild(renderRoot);
  console.log("[cert-pdf] contenido insertado", renderRoot.innerHTML.length);
  console.info("[cert-pdf] renderRoot creado y agregado al DOM", {
    childCount: renderRoot.childNodes.length,
  });
  return renderRoot;
};

const downloadPdfFile = async (filename, html) => {
  if (typeof window.html2pdf !== "function") {
    console.error("[cert-pdf] html2pdf no esta disponible");
    throw new Error("La libreria para generar PDF no esta disponible.");
  }

  console.info("[cert-pdf] html2pdf disponible");
  const renderRoot = createPdfRenderContainer(html);

  try {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }
    console.info("[cert-pdf] iniciando generacion de PDF", { filename });
    await Promise.all(
      Array.from(renderRoot.querySelectorAll("img"))
        .filter((img) => !img.complete)
        .map(
          (img) =>
            new Promise((resolve) => {
              img.onload = resolve;
              img.onerror = resolve;
            })
        )
    );

    const pdfTarget = renderRoot._pdfContent || renderRoot;
    const targetWidth = Math.ceil(pdfTarget.scrollWidth || pdfTarget.offsetWidth || 0);
    const targetHeight = Math.ceil(pdfTarget.scrollHeight || pdfTarget.offsetHeight || 0);

    await window
      .html2pdf()
      .set({
        margin: 0,
        filename,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
          windowWidth: targetWidth || 816,
          windowHeight: targetHeight || 1056,
          scrollX: 0,
          scrollY: 0,
        },
        jsPDF: {
          unit: "in",
          format: "letter",
          orientation: "portrait",
        },
      })
      .from(pdfTarget)
      .save();

    console.info("[cert-pdf] .save() ejecutado", { filename });
  } catch (error) {
    console.error("[cert-pdf] error al generar o descargar el PDF", error);
    throw error;
  } finally {
    renderRoot.remove();
    console.info("[cert-pdf] renderRoot removido del DOM");
  }
};

const fetchCertificateData = async (sessionId) => {
  const response = await fetch(
    `/api/afiliacion-documento?session_id=${encodeURIComponent(sessionId)}`
  );
  const payload = await response.json().catch(() => ({}));

  return { response, payload };
};

const buildCertificateHtml = async (data) => {
  const createdAt = parsePaidAt(data.paid_at);
  if (!createdAt) {
    throw new Error("No se pudo interpretar la fecha de pago.");
  }

  const expiresAt = new Date(createdAt);
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  const documentId = data.document_id || buildDocumentId(data.id, createdAt);
  const logoHtml = data.logo_url
    ? `<img src="${data.logo_url}" alt="Logo del club" />`
    : "";
  const groupHtml = data.group_photo_url
    ? `<img src="${data.group_photo_url}" alt="Foto grupal del club" />`
    : "";

  if (USE_SIMPLE_CERTIFICATE_HTML) {
    console.info("[cert-pdf] usando HTML simple temporal para diagnostico");
    return `
      <!doctype html>
      <html lang="es">
        <head>
          <meta charset="UTF-8" />
          <title>Afiliacion ANECAMM</title>
          <style>
            html, body {
              margin: 0;
              padding: 0;
              background: #ffffff;
              color: #111111;
              font-family: Arial, sans-serif;
            }

            body {
              width: 8.5in;
              min-height: 11in;
            }

            .page {
              width: 8.5in;
              min-height: 11in;
              padding: 0.75in;
              background: #ffffff;
            }

            h1 {
              margin: 0 0 0.35in;
              font-size: 28px;
              color: #970b1a;
            }

            .row {
              margin-bottom: 0.18in;
              font-size: 16px;
              line-height: 1.5;
            }

            .label {
              font-weight: 700;
            }
          </style>
        </head>
        <body>
          <main class="page">
            <h1>Afiliacion ANECAMM</h1>
            <div class="row"><span class="label">Nombre del club:</span> ${data.nombre_club}</div>
            <div class="row"><span class="label">Ciudad y estado:</span> ${data.ciudad_estado}</div>
            <div class="row"><span class="label">Instructor:</span> ${data.instructor}</div>
            <div class="row"><span class="label">ID del documento:</span> ${documentId}</div>
            <div class="row"><span class="label">Fecha de emision:</span> ${formatEsDate(createdAt)}</div>
          </main>
        </body>
      </html>
    `;
  }

  const templateResponse = await fetch(`${CERT_TEMPLATE_URL}?v=${Date.now()}`, { cache: "no-store" });
  if (!templateResponse.ok) {
    throw new Error("No se pudo cargar el formato de afiliación.");
  }

  const template = await templateResponse.text();
  console.info("[cert-pdf] template HTML cargado", {
    length: template.length,
    url: CERT_TEMPLATE_URL,
  });
  const replacements = {
    "{{nombre_club}}": data.nombre_club,
    "{{ciudad_estado}}": data.ciudad_estado,
    "{{nombre_coach}}": data.instructor,
    "{{nombre_instructor}}": data.instructor,
    "{{document_id}}": documentId,
    "{{signed_by}}": CERT_SIGNED_BY,
    "{{created_at}}": formatEsDate(createdAt),
    "{{expires_at}}": formatEsDate(expiresAt),
    "{{logo_html}}": logoHtml,
    "{{group_html}}": groupHtml,
  };

  return applyTemplateReplacements(template, replacements);
};

const attemptCertificateDownload = async (sessionId) => {
  const { response, payload } = await fetchCertificateData(sessionId);

  if (response.status === 409) {
    return { pending: true };
  }

  if (!response.ok || !payload?.ok || !payload?.data) {
    const message = payload?.error || "No se pudo preparar el documento.";
    throw new Error(message);
  }

  const html = await buildCertificateHtml(payload.data);
  const filename = `afiliacion-${payload.data.id}.pdf`;
  await downloadPdfFile(filename, html);

  return { ok: true };
};

const maybeDownloadCertificate = (sessionId) => {
  if (!sessionId) return;

  const storageKey = `${CERT_DOWNLOAD_KEY_PREFIX}${sessionId}`;
  if (sessionStorage.getItem(storageKey)) {
    console.info("[cert-pdf] descarga omitida: ya existe marca en sessionStorage", {
      sessionId,
    });
    return;
  }

  let attempts = 0;
  const maxAttempts = 8;
  const waitMs = 2000;

  const run = async () => {
    try {
      console.info("[cert-pdf] intentando descarga de certificado", {
        sessionId,
        attempt: attempts + 1,
        maxAttempts: maxAttempts + 1,
      });
      const result = await attemptCertificateDownload(sessionId);
      if (result?.ok) {
        sessionStorage.setItem(storageKey, "1");
        showStatus("Pago confirmado. Descargando tu documento...");
        console.info("[cert-pdf] descarga completada", { sessionId });
        return;
      }

      if (result?.pending && attempts < maxAttempts) {
        attempts += 1;
        showStatus("Pago confirmado. Generando tu documento...");
        console.info("[cert-pdf] documento pendiente, reintentando", {
          sessionId,
          nextAttempt: attempts + 1,
          waitMs,
        });
        setTimeout(run, waitMs);
        return;
      }

      showStatus(
        "Pago confirmado, pero el documento aun no esta listo. Intenta recargar en unos segundos.",
        true
      );
      console.warn("[cert-pdf] documento no listo tras agotar reintentos", {
        sessionId,
        attempts,
      });
    } catch (error) {
      console.error("[cert-pdf] fallo en maybeDownloadCertificate", error);
      showStatus(error.message || "No se pudo descargar el documento.", true);
    }
  };

  run();
};

const createTextCell = (value) => {
  const cell = document.createElement("td");
  cell.textContent = value;
  return cell;
};

const getSafeHttpUrl = (value) => {
  if (typeof value !== "string") return null;

  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
  } catch {
    return null;
  }

  return null;
};

const createSocialCell = (value) => {
  const cell = document.createElement("td");
  const safeUrl = getSafeHttpUrl(value);

  if (!safeUrl) {
    cell.textContent = "-";
    return cell;
  }

  const link = document.createElement("a");
  link.href = safeUrl;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = "Ver perfil";
  cell.appendChild(link);

  return cell;
};

const createDirectoryRow = (club) => {
  const row = document.createElement("tr");
  row.appendChild(createTextCell(club.nombre_club || ""));
  row.appendChild(createTextCell(club.ciudad_estado || ""));
  row.appendChild(createTextCell(club.instructor || ""));
  row.appendChild(createTextCell("-"));
  row.appendChild(createSocialCell(club.red_social));
  row.appendChild(createTextCell(club.estatus || ""));
  return row;
};

const renderDirectoryMessage = (message) => {
  if (!directoryBody) return;

  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = 6;
  cell.textContent = message;
  row.appendChild(cell);
  directoryBody.replaceChildren(row);
};

const filterClubs = (clubs, query) => {
  const q = query.trim().toLowerCase();
  if (!q) return clubs;

  return clubs.filter((club) => {
    const searchable = [
      club.nombre_club,
      club.ciudad_estado,
      club.instructor,
      club.red_social,
      club.estatus,
    ]
      .join(" ")
      .toLowerCase();

    return searchable.includes(q);
  });
};

const renderDirectory = () => {
  if (!directoryBody) return;

  const clubs = filterClubs(directoryData, directoryQuery);
  if (!clubs.length) {
    renderDirectoryMessage("No hay resultados para mostrar.");
    return;
  }

  directoryBody.replaceChildren(...clubs.map((club) => createDirectoryRow(club)));
};

async function cargarDirectorio() {
  if (!directoryBody) return;

  try {
    const response = await fetch("/api/directorio");
    if (!response.ok) {
      throw new Error(`Error ${response.status}`);
    }

    directoryData = await response.json();
    renderDirectory();
  } catch (error) {
    renderDirectoryMessage("No se pudo cargar el directorio.");
    console.error(error);
  }
}

const showCheckoutStateFromUrl = () => {
  if (!statusMsg) return;

  const params = new URLSearchParams(window.location.search);

  if (params.get("success") === "true") {
    showStatus("Pago confirmado. Tu afiliacion sera visible al confirmarse el webhook.");
    const sessionId = params.get("session_id");
    maybeDownloadCertificate(sessionId);
  }

  if (params.get("cancel") === "true") {
    showStatus("Pago cancelado. Puedes intentarlo nuevamente.", true);
  }
};

const createCheckoutSession = async () => {
  if (!form || isSubmittingCheckout) return;

  const fd = new FormData(form);
  const logoInput = form.querySelector('input[name="logo"]');
  const groupPhotoInput = form.querySelector('input[name="foto"]');
  const nombreClub = (fd.get("club") || "").toString().trim();
  const direccion = (fd.get("direccion") || "").toString().trim();
  const ciudadEstado = (fd.get("ciudadEstado") || "").toString().trim();
  const instructor = (fd.get("instructor") || "").toString().trim();
  const redSocial = (fd.get("redSocial") || "").toString().trim();
  const logoFile = logoInput?.files?.[0];
  const groupPhotoFile = groupPhotoInput?.files?.[0];

  if (!nombreClub || !direccion || !ciudadEstado || !instructor) {
    showStatus("Completa los datos obligatorios del club.", true);
    return;
  }

  if (!logoFile || logoFile.size <= 0) {
    showStatus("Debes seleccionar un logotipo.", true);
    return;
  }

  if (logoFile && !logoFile.type.startsWith("image/")) {
    showStatus("El archivo debe ser JPG o PNG.", true);
    return;
  }

  if (logoFile.size > MAX_FILE_SIZE_BYTES) {
    showStatus("El logotipo excede el tamaño maximo permitido de 5 MB.", true);
    return;
  }

  if (!groupPhotoFile || groupPhotoFile.size <= 0) {
    showStatus("Debes seleccionar una foto grupal.", true);
    return;
  }

  if (groupPhotoFile && !groupPhotoFile.type.startsWith("image/")) {
    showStatus("El archivo debe ser JPG o PNG.", true);
    return;
  }

  if (groupPhotoFile.size > MAX_FILE_SIZE_BYTES) {
    showStatus("La foto grupal excede el tamaño maximo permitido de 5 MB.", true);
    return;
  }

  const payload = new FormData();
  payload.append("nombre_club", nombreClub);
  payload.append("direccion", direccion);
  payload.append("ciudad_estado", ciudadEstado);
  payload.append("instructor", instructor);
  payload.append("red_social", redSocial);
  payload.append("logo", logoFile);
  payload.append("foto_grupal", groupPhotoFile);

  isSubmittingCheckout = true;
  showStatus("Redirigiendo a Stripe...");

  try {
    const response = await fetch("/api/create-checkout-session", {
      method: "POST",
      body: payload,
    });

    const result = await response.json();
    if (!response.ok || !result?.ok || !result?.checkoutUrl) {
      throw new Error(result?.error || `Error ${response.status}`);
    }

    window.location = result.checkoutUrl;
  } catch (error) {
    console.error(error);
    showStatus("No se pudo iniciar el pago. Intenta de nuevo.", true);
    isSubmittingCheckout = false;
  }
};

if (form) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    createCheckoutSession();
  });
}

if (checkoutLink) {
  checkoutLink.addEventListener("click", (event) => {
    event.preventDefault();
    createCheckoutSession();
  });
}

if (clearBtn) {
  clearBtn.addEventListener("click", () => {
    showStatus("La demo local ya no se utiliza en esta version.");
  });
}

if (directorySearch) {
  directorySearch.addEventListener("input", (event) => {
    directoryQuery = event.target.value;
    renderDirectory();
  });
}

const initCarousel = (carouselRoot) => {
  if (!carouselRoot) return;

  const track = carouselRoot.querySelector(".carousel-track");
  const slides = Array.from(carouselRoot.querySelectorAll(".carousel-slide"));
  const prevBtn = carouselRoot.querySelector(".carousel-btn.prev");
  const nextBtn = carouselRoot.querySelector(".carousel-btn.next");
  const dotsId = `${carouselRoot.id}Dots`;
  const dotsRoot = document.getElementById(dotsId);
  if (!track || !slides.length || !prevBtn || !nextBtn) return;

  let index = 0;
  let autoplay = null;
  let touchStartX = 0;
  let touchEndX = 0;

  const getVisible = (breakpoint) => {
    const value = Number.parseInt(carouselRoot.dataset[breakpoint], 10);
    return Number.isInteger(value) && value > 0 ? value : null;
  };

  const visibleCount = () => {
    const mobile = getVisible("visibleMobile") || 1;
    const tablet = getVisible("visibleTablet") || 2;
    const desktop = getVisible("visibleDesktop") || 3;
    if (window.matchMedia("(max-width: 560px)").matches) return mobile;
    if (window.matchMedia("(max-width: 980px)").matches) return tablet;
    return desktop;
  };

  const slideWidth = () => {
    const computed = window.getComputedStyle(track);
    const gap = Number.parseFloat(computed.columnGap || computed.gap || "0") || 0;
    return slides[0].getBoundingClientRect().width + gap;
  };

  const maxIndex = () => Math.max(0, slides.length - visibleCount());

  const buildDots = () => {
    if (!dotsRoot) return;
    const pages = maxIndex() + 1;
    dotsRoot.innerHTML = "";
    for (let i = 0; i < pages; i += 1) {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.setAttribute("aria-label", `Ir a grupo ${i + 1}`);
      dot.addEventListener("click", () => moveTo(i));
      dotsRoot.appendChild(dot);
    }
  };

  const paintDots = () => {
    if (!dotsRoot) return;
    const dots = Array.from(dotsRoot.querySelectorAll("button"));
    dots.forEach((dot, i) => dot.classList.toggle("active", i === index));
  };

  const moveTo = (nextIndex) => {
    index = Math.min(Math.max(nextIndex, 0), maxIndex());
    track.style.transform = `translateX(-${index * slideWidth()}px)`;
    paintDots();
  };

  const next = () => moveTo(index >= maxIndex() ? 0 : index + 1);
  const prev = () => moveTo(index <= 0 ? maxIndex() : index - 1);

  const stopAutoplay = () => {
    if (autoplay) {
      clearInterval(autoplay);
      autoplay = null;
    }
  };

  const startAutoplay = () => {
    stopAutoplay();
    autoplay = setInterval(next, 3400);
  };

  nextBtn.addEventListener("click", next);
  prevBtn.addEventListener("click", prev);

  carouselRoot.addEventListener("mouseenter", stopAutoplay);
  carouselRoot.addEventListener("mouseleave", startAutoplay);

  carouselRoot.addEventListener("touchstart", (event) => {
    touchStartX = event.changedTouches[0].clientX;
  });

  carouselRoot.addEventListener("touchend", (event) => {
    touchEndX = event.changedTouches[0].clientX;
    const delta = touchStartX - touchEndX;
    if (Math.abs(delta) < 30) return;
    if (delta > 0) next();
    if (delta < 0) prev();
  });

  window.addEventListener("resize", () => {
    buildDots();
    moveTo(index);
  });

  buildDots();
  moveTo(0);
  startAutoplay();
};

const initCarousels = () => {
  if (!carousels.length) return;
  carousels.forEach((carouselRoot) => initCarousel(carouselRoot));
};

const initMenu = () => {
  if (!menuToggle || !nav) return;

  menuToggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("open");
    menuToggle.setAttribute("aria-expanded", String(isOpen));
  });

  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      nav.classList.remove("open");
      menuToggle.setAttribute("aria-expanded", "false");
    });
  });
};

const initActiveNav = () => {
  if (!nav) return;

  const links = Array.from(nav.querySelectorAll("a"));
  const currentPage = window.location.pathname.split("/").pop() || "index.html";

  links.forEach((link) => {
    const href = link.getAttribute("href") || "";
    if (href.includes(".html")) {
      const targetPage = href.split("#")[0].replace("./", "");
      link.classList.toggle("active", targetPage === currentPage);
    }
  });

  const sections = links
    .map((link) => {
      const href = link.getAttribute("href") || "";
      if (!href.includes("#")) return null;
      const hash = `#${href.split("#")[1]}`;
      return document.querySelector(hash);
    })
    .filter(Boolean);

  if (!sections.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        const id = `#${entry.target.id}`;
        links.forEach((link) => {
          const href = link.getAttribute("href") || "";
          if (href.endsWith(id) || href === id) {
            link.classList.add("active");
          }
        });
      });
    },
    { rootMargin: "-45% 0px -45% 0px", threshold: 0 }
  );

  sections.forEach((section) => observer.observe(section));
};

document.addEventListener("DOMContentLoaded", () => {
  showCheckoutStateFromUrl();
  cargarDirectorio();
  initCarousels();
  initMenu();
  initActiveNav();
});





