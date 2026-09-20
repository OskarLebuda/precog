<script setup lang="ts">
const posts = Array.from({ length: 12 }, (_, i) => i + 1);
</script>

<template>
  <main>
    <h1>Your links, loaded before the click</h1>
    <p>
      Scroll and move the cursor. The module asks which link you are about to click and warms
      exactly that navigation.
    </p>
    <ul>
      <li v-for="post in posts" :key="post">
        <NuxtLink :to="`/blog/${post}`">Post number {{ post }}</NuxtLink>
      </li>
    </ul>
    <p>
      <NuxtLink to="/shop" data-precog="hint">The shop, hinted as a likely next step</NuxtLink>
    </p>
    <p>
      <NuxtLink to="/logout">Log out, on the deny list</NuxtLink>
      &middot;
      <NuxtLink to="/blog/1" data-precog="off">Post one, opted out</NuxtLink>
    </p>
  </main>
</template>
