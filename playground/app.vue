<template>
  <div class="app">
    <header>
      <NuxtLink to="/">nuxt-precog</NuxtLink>
      <nav>
        <NuxtLink to="/blog">Blog</NuxtLink>
        <NuxtLink to="/shop">Shop</NuxtLink>
        <NuxtLink to="/quiet">Quiet page</NuxtLink>
      </nav>
    </header>
    <NuxtPage />
  </div>
</template>

<style>
body {
  margin: 0;
  font:
    16px/1.6 system-ui,
    sans-serif;
  color: #111;
}
.app {
  max-width: 48rem;
  margin: 0 auto;
  padding: 1.5rem;
}
header {
  display: flex;
  gap: 1.5rem;
  align-items: baseline;
  border-bottom: 1px solid #e5e5e5;
  padding-bottom: 1rem;
  margin-bottom: 2rem;
}
nav {
  display: flex;
  gap: 1rem;
}
a {
  color: #0b57d0;
}
ul {
  padding-left: 1.2rem;
}
li {
  margin: 0.4rem 0;
}
</style>
