<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { bootstrapSession } from '$lib/session.svelte';
  import Spinner from '$lib/components/Spinner.svelte';

  let { children } = $props();
  let ready = $state(false);

  onMount(async () => {
    await bootstrapSession();
    ready = true;
  });
</script>

{#if ready}
  {@render children()}
{:else}
  <div class="center-screen"><Spinner /></div>
{/if}
