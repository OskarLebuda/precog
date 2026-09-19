<script setup lang="ts">
import { DOC_SLUGS, docBody, docTitle } from "#shared/docs";

const route = useRoute();
const slug = computed(() => String(route.params.slug));
const { data } = await useAsyncData(
  () => `doc-${slug.value}`,
  () => Promise.resolve({ title: docTitle(slug.value), body: docBody(slug.value) }),
  { watch: [slug] },
);
const others = computed(() => DOC_SLUGS.filter((other) => other !== slug.value).slice(0, 6));
</script>

<template>
  <main>
    <h1>{{ data?.title }}</h1>
    <p v-for="(paragraph, index) in data?.body" :key="index">{{ paragraph }}</p>
    <h2>See also</h2>
    <ul>
      <li v-for="other in others" :key="other">
        <NuxtLink :to="`/docs/${other}`">{{ docTitle(other) }}</NuxtLink>
      </li>
    </ul>
    <NuxtLink to="/docs">Back to the docs</NuxtLink>
  </main>
</template>
