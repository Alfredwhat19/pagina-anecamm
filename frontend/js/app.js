const STORAGE_KEY = "anecamm_clubes";
const form = document.getElementById("clubForm");
const directoryBody = document.getElementById("directoryBody");
const statusMsg = document.getElementById("statusMsg");
const clearBtn = document.getElementById("clearData");
const directorySearch = document.getElementById("directorySearch");
const carousels = Array.from(document.querySelectorAll(".js-carousel"));
const nav = document.getElementById("mainNav");
const menuToggle = document.getElementById("menuToggle");

let directoryQuery = "";
let directoryData = [];

const getClubs = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
};

const saveClubs = (clubs) => localStorage.setItem(STORAGE_KEY, JSON.stringify(clubs));

const maskCard = (card) => {
  const clean = (card || "").replace(/\D/g, "");
  return clean.length >= 4 ? `**** **** **** ${clean.slice(-4)}` : "****";
};

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

const validatePayment = (data) => {
  const cardDigits = data.tarjeta.replace(/\D/g, "");
  if (cardDigits.length < 16) {
    return "El numero de tarjeta debe tener al menos 16 digitos.";
  }
  if (!/^(0[1-9]|1[0-2])\/[0-9]{2}$/.test(data.vencimiento)) {
    return "La vigencia debe tener formato MM/AA.";
  }
  if (!/^\d{3,4}$/.test(data.cvv)) {
    return "El CVV debe tener 3 o 4 digitos.";
  }
  return null;
};

if (form) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    showStatus("Procesando pago...");

    const fd = new FormData(form);
    const data = Object.fromEntries(fd.entries());

    const paymentError = validatePayment(data);
    if (paymentError) {
      showStatus(paymentError, true);
      return;
    }

    setTimeout(() => {
      const newClub = {
        club: data.club.trim(),
        direccion: data.direccion.trim(),
        ciudadEstado: data.ciudadEstado.trim(),
        telefono: data.telefono.trim(),
        instructor: data.instructor.trim(),
        redSocial: data.redSocial.trim(),
        logo: data.logo.trim(),
        foto: data.foto.trim(),
        estatus: `Afiliado y pagado (${maskCard(data.tarjeta)})`,
        fechaAfiliacion: new Date().toISOString(),
      };

      const clubs = getClubs();
      clubs.unshift(newClub);
      saveClubs(clubs);
      renderDirectory();

      form.reset();
      showStatus("Pago aprobado. El club fue agregado al directorio.");
    }, 900);
  });
}

if (clearBtn) {
  clearBtn.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    renderDirectory();
    showStatus("Datos de demostracion eliminados.");
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
  cargarDirectorio();
  initCarousels();
  initMenu();
  initActiveNav();
});
