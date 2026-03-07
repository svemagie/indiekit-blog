export const SidebarComponent = class extends HTMLElement {
  connectedCallback() {
    this.closeButton = this.querySelector(".sidebar__close");
    this.backdrop = document.querySelector(".sidebar-backdrop");
    this.hamburger = document.querySelector(".header__hamburger");

    if (this.closeButton) {
      this.closeButton.addEventListener("click", () => this.close());
    }

    if (this.backdrop) {
      this.backdrop.addEventListener("click", () => this.close());
    }

    if (this.hamburger) {
      this.hamburger.addEventListener("click", () => this.open());
    }

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.classList.contains("sidebar--open")) {
        this.close();
      }
    });

    this.mediaQuery = window.matchMedia("(width >= 48rem)");
    this.mediaQuery.addEventListener("change", (event) => {
      if (event.matches && this.classList.contains("sidebar--open")) {
        this.close();
      }
    });
  }

  open() {
    this.classList.add("sidebar--open");

    if (this.backdrop) {
      this.backdrop.classList.add("sidebar-backdrop--visible");
    }

    const firstLink = this.querySelector(".sidebar__list-item a");
    if (firstLink) {
      firstLink.focus();
    }
  }

  close() {
    this.classList.remove("sidebar--open");

    if (this.backdrop) {
      this.backdrop.classList.remove("sidebar-backdrop--visible");
    }

    if (this.hamburger) {
      this.hamburger.focus();
    }
  }
};
