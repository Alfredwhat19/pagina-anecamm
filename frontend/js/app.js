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

let directoryQuery = "";
let directoryData = [];
let isSubmittingCheckout = false;

const showStatus = (message, isError = false) => {
  if (!statusMsg) return;
  statusMsg.textContent = message;
  statusMsg.classList.toggle("error", isError);
};

const rowTemplate = (club) => {
  const red = club.red_social
    ? `<a href="${club.red_social}" target="_blank" rel="noreferrer">Ver perfil</a>`
    : "-";

  return `
    <tr>
      <td>${club.nombre_club}</td>
      <td>${club.ciudad_estado}</td>
      <td>${club.instructor}</td>
      <td>-</td>
      <td>${red}</td>
      <td>${club.estatus}</td>
    </tr>
  `;
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
    directoryBody.innerHTML = `
      <tr>
        <td colspan="6">No hay resultados para mostrar.</td>
      </tr>
    `;
    return;
  }

  directoryBody.innerHTML = clubs.map(rowTemplate).join("");
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
    directoryBody.innerHTML = `
      <tr>
        <td colspan="6">No se pudo cargar el directorio.</td>
      </tr>
    `;
    console.error(error);
  }
}

const showCheckoutStateFromUrl = () => {
  if (!statusMsg) return;

  const params = new URLSearchParams(window.location.search);

  if (params.get("success") === "true") {
    showStatus("Pago confirmado. Tu afiliacion sera visible al confirmarse el webhook.");
  }

  if (params.get("cancel") === "true") {
    showStatus("Pago cancelado. Puedes intentarlo nuevamente.", true);
  }
};

const createCheckoutSession = async () => {
  if (!form || isSubmittingCheckout) return;

  const fd = new FormData(form);
  const nombreClub = (fd.get("club") || "").toString().trim();
  const direccion = (fd.get("direccion") || "").toString().trim();
  const ciudadEstado = (fd.get("ciudadEstado") || "").toString().trim();
  const instructor = (fd.get("instructor") || "").toString().trim();
  const redSocial = (fd.get("redSocial") || "").toString().trim();
  const logo = fd.get("logo");
  const fotoGrupal = fd.get("foto");

  if (!nombreClub || !direccion || !ciudadEstado || !instructor) {
    showStatus("Completa los datos obligatorios del club.", true);
    return;
  }

  if (!(logo instanceof File) || logo.size <= 0) {
    showStatus("Debes seleccionar un logotipo.", true);
    return;
  }

  if (!(fotoGrupal instanceof File) || fotoGrupal.size <= 0) {
    showStatus("Debes seleccionar una foto grupal.", true);
    return;
  }

  const payload = new FormData();
  payload.append("nombre_club", nombreClub);
  payload.append("direccion", direccion);
  payload.append("ciudad_estado", ciudadEstado);
  payload.append("instructor", instructor);
  payload.append("red_social", redSocial);
  payload.append("logo", logo);
  payload.append("foto_grupal", fotoGrupal);

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
