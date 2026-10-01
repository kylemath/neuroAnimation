/**
 * Fallback structures.json catalog with schematic MNI placeholders.
 *
 * Contract (also expected of assets/structures.json from the data pipeline):
 *   version, space, units, axes, sceneMapping, origin
 *   groups[]: { id, name, asset, layer, defaultVisible, renderOrder }
 *   fiducials[]: { id, name, mni:[x,y,z] }
 *   slicePresets[]: { id, name, plane, value }
 *   structures[]: {
 *     id, name, side: "L"|"R"|"mid", group, parent, meshNode,
 *     colour, opacity, centroid:[x,y,z], function, clinical, chapter6,
 *     connected[], links[], source, licence, schematic?,
 *     layer, kind: "mesh"|"folder"|"section",
 *     transmitter?, cn?: { number, name, nucleus },
 *     defaultVisible?,
 *     placeholder?: { type, center, radii, radius, size, points, tubeRadius, ... }
 *   }
 *
 * GLBs are baked in three.js world = (MNI x, MNI z, −MNI y). Placeholders use MNI mm.
 */

const ALLEN = { source: 'Allen Human Reference Atlas 3D (HRA) · schematic placeholder', licence: 'CC BY 4.0' };
const PITT = { source: 'PittBrains3D · schematic placeholder', licence: 'CC BY-SA 4.0' };
const AAN = { source: 'Harvard Ascending Arousal Network Atlas v2.0 · schematic placeholder', licence: 'CC0' };
const BP3D = { source: 'BodyParts3D · schematic placeholder', licence: 'CC BY-SA 2.1 JP' };
const SCH = { source: 'Procedural schematic (no open mesh in the composite yet)', licence: 'CC BY 4.0' };

function text(fn, clinical, chapter6) {
  return { function: fn, clinical, chapter6 };
}

function flipPlaceholder(ph, sx) {
  if (!ph) return undefined;
  const out = { ...ph };
  if (ph.center) out.center = [sx, ph.center[1], ph.center[2]];
  if (ph.points) {
    out.points = ph.points.map((p) => [Math.abs(p[0]) * Math.sign(sx || 1), p[1], p[2]]);
  }
  return out;
}

export function createFallbackManifest() {
  const structures = [];

  const add = (s) => {
    structures.push({
      kind: 'mesh',
      side: 'mid',
      opacity: 0.9,
      connected: [],
      links: [],
      ...s,
      kind: s.kind || 'mesh',
      side: s.side || 'mid',
      opacity: s.opacity ?? 0.9,
      connected: s.connected || [],
      links: s.links || [],
      schematic: s.schematic !== false,
      defaultVisible: s.defaultVisible !== false,
    });
  };

  const folder = (id, name, group, parent, layer) => {
    add({
      id,
      name,
      group,
      parent: parent || null,
      kind: 'folder',
      layer: layer || group,
      meshNode: null,
      colour: '#9fb0c3',
      opacity: 1,
      centroid: [0, 0, 0],
      schematic: false,
    });
  };

  const addLR = (base) => {
    const x = Math.abs(base.x);
    for (const [side, sx, suffix] of [['L', -x, 'lh'], ['R', x, 'rh']]) {
      const placeholder = base.placeholder
        ? flipPlaceholder({
          ...base.placeholder,
          center: base.placeholder.center || [x, base.y, base.z],
        }, sx)
        : {
          type: base.type || 'ellipsoid',
          center: [sx, base.y, base.z],
          radii: base.radii,
          radius: base.radius,
          size: base.size,
          tubeRadius: base.tubeRadius,
          points: base.pointsL && base.pointsR
            ? (side === 'L' ? base.pointsL : base.pointsR)
            : base.points
              ? base.points.map((p) => [Math.abs(p[0]) * Math.sign(sx), p[1], p[2]])
              : undefined,
          turns: base.turns,
          height: base.height,
          plane: base.plane,
          thickness: base.thickness,
        };

      add({
        id: `${base.id}-${suffix}`,
        name: `${side === 'L' ? 'Left' : 'Right'} ${base.name}`,
        side,
        group: base.group,
        parent: base.parent,
        meshNode: `${base.meshNode || base.id}_${suffix}`,
        colour: base.colour,
        opacity: base.opacity,
        centroid: [sx, base.y, base.z],
        function: base.function,
        clinical: base.clinical,
        chapter6: base.chapter6,
        connected: (base.connected || []).map((c) => (c.includes('{s}') ? c.split('{s}').join(suffix) : c)),
        source: base.source,
        licence: base.licence,
        layer: base.layer,
        transmitter: base.transmitter,
        cn: base.cn,
        defaultVisible: base.defaultVisible,
        showWith: base.showWith,
        placeholder,
      });
    }
  };

  folder('cortex', 'Cerebral cortex', 'core', null, 'cortex');
  folder('brainstem', 'Brainstem', 'core', null, 'brainstem');
  folder('thalamus', 'Thalamus', 'subcortical', null, 'subcortical');
  folder('basal-ganglia', 'Basal ganglia', 'subcortical', null, 'subcortical');
  folder('limbic', 'Limbic system', 'subcortical', null, 'subcortical');
  folder('diencephalon', 'Diencephalon', 'subcortical', null, 'subcortical');

  add({
    id: 'scalp',
    name: 'Scalp / head surface',
    group: 'head',
    parent: null,
    meshNode: 'scalp',
    colour: '#d4b8a0',
    opacity: 0.07,
    centroid: [0, -8, 18],
    layer: 'head',
    ...ALLEN,
    source: 'fsaverage / MNE-style head surface · schematic placeholder',
    ...text(
      'Translucent scalp for spatial context. Fiducials (nasion, LPA, RPA, Cz) sit on this surface in the 10–20 frame.',
      'Used here as an orientation shell, not as a surgical scalp model.',
      'cortex',
    ),
    placeholder: { type: 'ellipsoid', center: [0, -8, 18], radii: [92, 112, 98] },
  });

  addLR({
    id: 'cortex',
    name: 'cerebral cortex',
    x: 34,
    y: -10,
    z: 22,
    group: 'core',
    parent: 'cortex',
    meshNode: 'cortex',
    colour: '#8eb4d4',
    opacity: 0.22,
    layer: 'cortex',
    radii: [40, 66, 46],
    connected: ['wm-{s}', 'thalamus-{s}'],
    ...ALLEN,
    ...text(
      'Neocortex: six-layered sheet folded into gyri and sulci. It is the seat of perception, action, language and association.',
      'Focal lesions produce highly local signs (aphasia, neglect, hemiparesis) that map onto Brodmann / gyral anatomy.',
      'cortex',
    ),
  });

  add({
    id: 'midbrain',
    name: 'Midbrain (mesencephalon)',
    group: 'core',
    parent: 'brainstem',
    meshNode: 'midbrain',
    colour: '#e07a5f',
    opacity: 0.85,
    centroid: [0, -22, -10],
    layer: 'brainstem',
    connected: ['pons', 'thalamus-lh', 'thalamus-rh', 'pag', 'vta'],
    ...ALLEN,
    ...text(
      'Rostral brainstem: tectum (colliculi), tegmentum (red nucleus, SN, reticular formation) and cerebral peduncles. Cranial nerves III–IV exit here.',
      'Midbrain strokes (Weber, Benedikt, Parinaud) combine oculomotor signs with corticospinal or cerebellar findings.',
      'brainstem',
    ),
    placeholder: { type: 'ellipsoid', center: [0, -22, -10], radii: [12, 11, 10] },
  });

  add({
    id: 'superior-colliculus',
    name: 'Superior colliculus',
    group: 'core',
    parent: 'brainstem',
    meshNode: 'superior_colliculus',
    colour: '#f2cc8f',
    opacity: 0.95,
    centroid: [0, -32, -2],
    layer: 'brainstem',
    connected: ['inferior-colliculus', 'midbrain'],
    ...ALLEN,
    ...text(
      'Paired tectal hillocks for visuomotor orienting and the vertical gaze pathways (posterior commissure / riMLF).',
      'Compression at the tectal plate (pineal mass) yields Parinaud syndrome: upgaze palsy and light-near dissociation.',
      'midbrain',
    ),
    placeholder: { type: 'ellipsoid', center: [0, -32, -2], radii: [8, 4, 3.5] },
  });

  add({
    id: 'inferior-colliculus',
    name: 'Inferior colliculus',
    group: 'core',
    parent: 'brainstem',
    meshNode: 'inferior_colliculus',
    colour: '#f4a261',
    opacity: 0.95,
    centroid: [0, -34, -8],
    layer: 'brainstem',
    connected: ['superior-colliculus', 'mgn-lh', 'mgn-rh'],
    ...BP3D,
    ...text(
      'Auditory midbrain nucleus: almost all ascending brainstem auditory fibres synapse here before the MGN.',
      'Lesions can impair sound localisation and, rarely, cause auditory hallucinations or palatal myoclonus circuits nearby.',
      'midbrain',
    ),
    placeholder: { type: 'ellipsoid', center: [0, -34, -8], radii: [7, 4, 3] },
  });

  add({
    id: 'pons',
    name: 'Pons',
    group: 'core',
    parent: 'brainstem',
    meshNode: 'pons',
    colour: '#c26d5a',
    opacity: 0.85,
    centroid: [0, -28, -24],
    layer: 'brainstem',
    connected: ['midbrain', 'medulla', 'cn5-lh', 'cn5-rh'],
    ...ALLEN,
    ...text(
      'Basilar pons carries corticospinal and corticopontine fibres; the tegmentum holds CN V–VIII nuclei, the locus coeruleus and pontine reticular formation.',
      'Pontine infarcts (locked-in, Millard–Gubler) and central pontine myelinolysis are classic clinical correlates.',
      'brainstem',
    ),
    placeholder: { type: 'ellipsoid', center: [0, -28, -24], radii: [16, 12, 11] },
  });

  add({
    id: 'medulla',
    name: 'Medulla oblongata',
    group: 'core',
    parent: 'brainstem',
    meshNode: 'medulla',
    colour: '#9b4d4d',
    opacity: 0.88,
    centroid: [0, -36, -44],
    layer: 'brainstem',
    connected: ['pons', 'pyramid-lh', 'pyramid-rh', 'cn10-lh', 'cn10-rh'],
    ...ALLEN,
    ...text(
      'Caudal brainstem: pyramids, olives, and the vital cardiorespiratory reticular networks. CN IX–XII nuclei live here.',
      'Lateral medullary (Wallenberg) and medial medullary syndromes are teaching staples; medullary compression is life-threatening.',
      'brainstem',
    ),
    placeholder: { type: 'ellipsoid', center: [0, -36, -44], radii: [9, 10, 14] },
  });

  addLR({
    id: 'cerebral-peduncle',
    name: 'cerebral peduncle',
    x: 12,
    y: -18,
    z: -14,
    group: 'core',
    parent: 'brainstem',
    meshNode: 'cerebral_peduncle',
    colour: '#e9c46a',
    opacity: 0.9,
    layer: 'brainstem',
    radii: [5, 8, 6],
    connected: ['midbrain', 'internal-capsule-{s}'],
    ...ALLEN,
    ...text(
      'Crus cerebri: compact corticospinal and corticobulbar fibres on the ventral midbrain.',
      'Weber syndrome: ipsilateral III palsy plus contralateral hemiparesis from a peduncular infarct.',
      'brainstem',
    ),
  });

  addLR({
    id: 'pyramid',
    name: 'medullary pyramid',
    x: 4,
    y: -38,
    z: -50,
    group: 'core',
    parent: 'brainstem',
    meshNode: 'pyramid',
    colour: '#f4d35e',
    opacity: 0.92,
    layer: 'brainstem',
    radii: [3, 5, 8],
    connected: ['medulla', 'cerebral-peduncle-{s}'],
    ...ALLEN,
    ...text(
      'Corticospinal tract on the ventral medulla; ~90% of fibres decussate at the pyramidal decussation to form the lateral CST.',
      'Medial medullary (Dejerine) syndrome hits the pyramid, medial lemniscus and hypoglossal nerve.',
      'brainstem',
    ),
  });

  addLR({
    id: 'inferior-olive',
    name: 'inferior olivary nucleus',
    x: 6,
    y: -40,
    z: -46,
    group: 'core',
    parent: 'brainstem',
    meshNode: 'inferior_olive',
    colour: '#b08968',
    opacity: 0.95,
    layer: 'brainstem',
    radii: [3.5, 4, 5],
    connected: ['medulla', 'dentate-{s}'],
    ...ALLEN,
    ...text(
      'Climbing-fibre source to cerebellar Purkinje cells; central to motor timing and learning.',
      'Olivary hypertrophy after central tegmental-tract lesions is linked to palatal (and sometimes ocular) myoclonus.',
      'brainstem',
    ),
  });

  addLR({
    id: 'red-nucleus',
    name: 'red nucleus',
    x: 6,
    y: -16,
    z: -8,
    group: 'core',
    parent: 'brainstem',
    meshNode: 'red_nucleus',
    colour: '#c1121f',
    opacity: 0.95,
    layer: 'brainstem',
    radius: 3.4,
    type: 'sphere',
    connected: ['midbrain', 'dentate-{s}'],
    ...SCH,
    ...text(
      'Midbrain tegmental nucleus on the dentatorubrothalamic and rubrospinal paths. Drawn as a labelled schematic ellipsoid — it is not in the open mesh sets.',
      'Claude and Benedikt syndromes involve the red nucleus with cerebellar tremor and oculomotor palsy.',
      'midbrain',
    ),
  });

  addLR({
    id: 'wm',
    name: 'cerebral white matter',
    x: 26,
    y: -12,
    z: 18,
    group: 'white-matter',
    parent: null,
    meshNode: 'white_matter',
    colour: '#f0e6d8',
    opacity: 0.4,
    layer: 'white-matter',
    radii: [26, 48, 32],
    connected: ['cortex-{s}', 'corpus-callosum', 'internal-capsule-{s}'],
    ...ALLEN,
    ...text(
      'Myelinated association, commissural and projection axons that wire cortex to cortex and to subcortex.',
      'Leukoaraiosis, MS plaques and watershed infarcts preferentially hit this compartment.',
      'white-matter',
    ),
  });

  add({
    id: 'corpus-callosum',
    name: 'Corpus callosum',
    group: 'white-matter',
    parent: null,
    meshNode: 'corpus_callosum',
    colour: '#fff3e0',
    opacity: 0.8,
    centroid: [0, -6, 22],
    layer: 'white-matter',
    connected: ['wm-lh', 'wm-rh', 'cortex-lh', 'cortex-rh'],
    ...ALLEN,
    ...text(
      'The great commissure: genu, body, splenium (and rostrum) interconnecting homologous cortical fields.',
      'Callosal disconnection (alien-hand, left anomia for objects in the left hand) and agenesis are classic teaching cases.',
      'white-matter',
    ),
    placeholder: { type: 'ellipsoid', center: [0, -6, 22], radii: [8, 30, 7] },
  });

  add({
    id: 'fornix',
    name: 'Fornix',
    group: 'white-matter',
    parent: null,
    meshNode: 'fornix',
    colour: '#ffe8a3',
    opacity: 0.9,
    centroid: [0, -8, 10],
    layer: 'white-matter',
    connected: ['hippocampus-lh', 'hippocampus-rh', 'hypothalamus'],
    ...ALLEN,
    ...text(
      'Main hippocampal output arching under the corpus callosum to the mammillary bodies (Papez circuit).',
      'Fornix damage (colloid cyst surgery, trauma) can produce severe anterograde amnesia.',
      'limbic',
    ),
    placeholder: {
      type: 'tube',
      tubeRadius: 1.4,
      points: [
        [-22, -22, -8], [-10, -14, 8], [0, -4, 14], [0, 6, 4], [0, 4, -10],
      ],
    },
  });

  addLR({
    id: 'internal-capsule',
    name: 'internal capsule',
    x: 18,
    y: -6,
    z: 8,
    group: 'white-matter',
    parent: null,
    meshNode: 'internal_capsule',
    colour: '#f6e7c1',
    opacity: 0.75,
    layer: 'white-matter',
    radii: [5, 16, 14],
    connected: ['thalamus-{s}', 'caudate-{s}', 'putamen-{s}', 'cortex-{s}'],
    ...ALLEN,
    ...text(
      'Compact projection bundle (anterior limb, genu, posterior limb) between caudate/thalamus and lentiform nucleus.',
      'A small lacunar infarct in the posterior limb can cause a dense contralateral hemiparesis.',
      'white-matter',
    ),
  });

  addLR({
    id: 'optic-tract',
    name: 'optic tract',
    x: 16,
    y: 4,
    z: -12,
    group: 'white-matter',
    parent: null,
    meshNode: 'optic_tract',
    colour: '#f4d35e',
    opacity: 0.95,
    layer: 'white-matter',
    type: 'tube',
    tubeRadius: 1.3,
    points: [[4, 18, -16], [12, 8, -14], [22, -18, -6], [22, -26, -4]],
    connected: ['cn2-{s}', 'lgn-{s}'],
    ...ALLEN,
    ...text(
      'Post-chiasmatic retinal axons heading for the lateral geniculate nucleus.',
      'A tract lesion yields contralateral homonymous hemianopia.',
      'cranial-nerves',
    ),
  });

  addLR({
    id: 'thalamus',
    name: 'thalamus',
    x: 11,
    y: -18,
    z: 6,
    group: 'subcortical',
    parent: 'thalamus',
    meshNode: 'thalamus',
    colour: '#80b918',
    opacity: 0.88,
    layer: 'subcortical',
    radii: [10, 12, 10],
    connected: ['cortex-{s}', 'iln-{s}', 'hypothalamus'],
    ...ALLEN,
    ...text(
      'Relay and association nuclei that gate almost every subcortical input to cortex (except olfaction).',
      'Thalamic strokes produce hemisensory loss, pain (Déjerine–Roussy), aphasia or neglect depending on the territory.',
      'diencephalon',
    ),
  });

  addLR({
    id: 'iln',
    name: 'intralaminar thalamus (CM/Pf)',
    x: 5,
    y: -20,
    z: 2,
    group: 'subcortical',
    parent: 'thalamus',
    meshNode: 'intralaminar_thalamus',
    colour: '#a7c957',
    opacity: 0.95,
    layer: 'subcortical',
    radius: 3.2,
    type: 'sphere',
    connected: ['thalamus-{s}', 'pag', 'ppn-{s}'],
    ...ALLEN,
    ...text(
      'Centromedian / parafascicular complex — the thalamic target of the dorsal ARAS route, projecting widely to cortex and striatum.',
      'Intralaminar lesions and DBS targets are discussed in disorders of consciousness and Tourette syndrome.',
      'aras',
    ),
  });

  addLR({
    id: 'pulvinar',
    name: 'pulvinar',
    x: 14,
    y: -28,
    z: 8,
    group: 'subcortical',
    parent: 'thalamus',
    meshNode: 'pulvinar',
    colour: '#90a955',
    opacity: 0.92,
    layer: 'subcortical',
    radii: [7, 6, 7],
    connected: ['thalamus-{s}', 'cortex-{s}'],
    ...ALLEN,
    ...text(
      'Large posterior association nucleus linking visual and attentional cortical networks.',
      'Pulvinar damage is associated with spatial neglect and visual-attention deficits.',
      'diencephalon',
    ),
  });

  addLR({
    id: 'lgn',
    name: 'lateral geniculate nucleus',
    x: 22,
    y: -26,
    z: -4,
    group: 'subcortical',
    parent: 'thalamus',
    meshNode: 'lgn',
    colour: '#bfd200',
    opacity: 0.95,
    layer: 'subcortical',
    radius: 3,
    type: 'sphere',
    connected: ['optic-tract-{s}', 'cortex-{s}'],
    ...ALLEN,
    ...text(
      'Thalamic visual relay: magno- and parvocellular laminae project via optic radiations to V1.',
      'LGN lesions cause incongruous homonymous field cuts.',
      'diencephalon',
    ),
  });

  addLR({
    id: 'mgn',
    name: 'medial geniculate nucleus',
    x: 16,
    y: -28,
    z: -6,
    group: 'subcortical',
    parent: 'thalamus',
    meshNode: 'mgn',
    colour: '#d4d700',
    opacity: 0.95,
    layer: 'subcortical',
    radius: 2.6,
    type: 'sphere',
    connected: ['inferior-colliculus', 'cortex-{s}'],
    ...ALLEN,
    ...text(
      'Thalamic auditory relay to Heschl’s gyrus.',
      'Rare isolated lesions can impair auditory discrimination.',
      'diencephalon',
    ),
  });

  add({
    id: 'hypothalamus',
    name: 'Hypothalamus',
    group: 'subcortical',
    parent: 'diencephalon',
    meshNode: 'hypothalamus',
    colour: '#f77f00',
    opacity: 0.92,
    centroid: [0, 2, -10],
    layer: 'subcortical',
    connected: ['tmn', 'pituitary', 'fornix', 'basal-forebrain'],
    ...ALLEN,
    ...text(
      'Homeostatic and endocrine brain: autonomic, circadian, thermoregulatory, appetitive and pituitary-control nuclei. The ventral ARAS route traverses here.',
      'Hypothalamic lesions disturb sleep, temperature, appetite, water balance and endocrine axes.',
      'diencephalon',
    ),
    placeholder: { type: 'ellipsoid', center: [0, 2, -10], radii: [6, 8, 5] },
  });

  add({
    id: 'tmn',
    name: 'Tuberomammillary nucleus (histamine)',
    group: 'subcortical',
    parent: 'diencephalon',
    meshNode: 'tmn',
    colour: '#ffb703',
    opacity: 0.95,
    centroid: [0, -2, -12],
    layer: 'subcortical',
    transmitter: 'histamine',
    connected: ['hypothalamus', 'basal-forebrain', 'vta'],
    ...ALLEN,
    ...text(
      'Sole neuronal histamine source. A key waking node on the ventral ARAS path; antihistamines that cross the BBB cause drowsiness here.',
      'TMN inhibition is a target of some hypnotics; narcolepsy circuits interact with this wake-promoting cell group.',
      'aras',
    ),
    placeholder: { type: 'sphere', center: [0, -2, -12], radius: 2.8 },
  });

  add({
    id: 'pituitary',
    name: 'Pituitary gland',
    group: 'subcortical',
    parent: 'diencephalon',
    meshNode: 'pituitary',
    colour: '#e56b6f',
    opacity: 0.95,
    centroid: [0, 10, -32],
    layer: 'subcortical',
    connected: ['hypothalamus'],
    ...BP3D,
    ...text(
      'Adenohypophysis and neurohypophysis in the sella, under hypothalamic releasing-hormone and ADH/oxytocin control.',
      'Adenomas cause endocrine syndromes and bitemporal hemianopia from chiasmal compression.',
      'diencephalon',
    ),
    placeholder: { type: 'ellipsoid', center: [0, 10, -32], radii: [5, 4, 3.5] },
  });

  add({
    id: 'pineal',
    name: 'Pineal gland',
    group: 'subcortical',
    parent: 'diencephalon',
    meshNode: 'pineal',
    colour: '#d62828',
    opacity: 0.95,
    centroid: [0, -28, 4],
    layer: 'subcortical',
    connected: ['superior-colliculus'],
    ...BP3D,
    ...text(
      'Epithalamic endocrine gland secreting melatonin; sits above the tectal plate in the quadrigeminal cistern.',
      'Pineal masses obstruct the aqueduct (hydrocephalus) and compress the superior colliculi (Parinaud).',
      'diencephalon',
    ),
    placeholder: { type: 'sphere', center: [0, -28, 4], radius: 3.2 },
  });

  add({
    id: 'basal-forebrain',
    name: 'Basal forebrain (incl. nucleus basalis)',
    group: 'subcortical',
    parent: 'limbic',
    meshNode: 'basal_forebrain',
    colour: '#ff9f1c',
    opacity: 0.9,
    centroid: [0, 10, -8],
    layer: 'subcortical',
    transmitter: 'ACh',
    connected: ['hypothalamus', 'cortex-lh', 'cortex-rh', 'tmn'],
    ...ALLEN,
    ...text(
      'Cholinergic waking and memory node (nucleus basalis of Meynert, medial septum, diagonal band) — the cortical end of the ventral ARAS route.',
      'Degenerates early in Alzheimer disease; anticholinergic burden impairs attention and memory.',
      'aras',
    ),
    placeholder: { type: 'ellipsoid', center: [0, 10, -8], radii: [10, 8, 5] },
  });

  addLR({
    id: 'caudate',
    name: 'caudate nucleus',
    x: 12,
    y: 8,
    z: 12,
    group: 'subcortical',
    parent: 'basal-ganglia',
    meshNode: 'caudate',
    colour: '#48cae4',
    opacity: 0.9,
    layer: 'subcortical',
    radii: [7, 18, 8],
    connected: ['putamen-{s}', 'gpe-{s}', 'thalamus-{s}'],
    ...ALLEN,
    ...text(
      'Striatal nucleus hugging the lateral ventricle; associative and oculomotor loops dominate in the head of caudate.',
      'Atrophies in Huntington disease; caudate infarcts can cause abulia or choreiform movements.',
      'basal-ganglia',
    ),
  });

  addLR({
    id: 'putamen',
    name: 'putamen',
    x: 26,
    y: 4,
    z: 4,
    group: 'subcortical',
    parent: 'basal-ganglia',
    meshNode: 'putamen',
    colour: '#00b4d8',
    opacity: 0.9,
    layer: 'subcortical',
    radii: [8, 12, 8],
    connected: ['caudate-{s}', 'gpe-{s}', 'gpi-{s}'],
    ...ALLEN,
    ...text(
      'Lentiform striatum, heavily sensorimotor; with the caudate it forms the input stage of the basal ganglia.',
      'Putaminal haemorrhage (hypertension) is a common deep ICH; lacunar infarcts cause lacunar syndromes.',
      'basal-ganglia',
    ),
  });

  addLR({
    id: 'gpe',
    name: 'globus pallidus externa',
    x: 21,
    y: 2,
    z: 2,
    group: 'subcortical',
    parent: 'basal-ganglia',
    meshNode: 'gpe',
    colour: '#0096c7',
    opacity: 0.92,
    layer: 'subcortical',
    radii: [5, 7, 5],
    connected: ['putamen-{s}', 'stn-{s}', 'gpi-{s}'],
    ...ALLEN,
    ...text(
      'Indirect-pathway node: GABAergic projection to STN. Shapes the brake on movement.',
      'Pallidal lesions and DBS alter dystonia and dyskinesia circuits.',
      'basal-ganglia',
    ),
  });

  addLR({
    id: 'gpi',
    name: 'globus pallidus interna',
    x: 17,
    y: 0,
    z: 0,
    group: 'subcortical',
    parent: 'basal-ganglia',
    meshNode: 'gpi',
    colour: '#0077b6',
    opacity: 0.95,
    layer: 'subcortical',
    radii: [4, 6, 4.5],
    connected: ['gpe-{s}', 'stn-{s}', 'thalamus-{s}'],
    ...ALLEN,
    ...text(
      'Major basal-ganglia output to motor thalamus (and brainstem). High tonic inhibition is paused to release a selected action.',
      'GPi DBS is a standard treatment for dystonia and a Parkinson option.',
      'basal-ganglia',
    ),
  });

  addLR({
    id: 'nac',
    name: 'nucleus accumbens',
    x: 10,
    y: 12,
    z: -6,
    group: 'subcortical',
    parent: 'basal-ganglia',
    meshNode: 'nucleus_accumbens',
    colour: '#90e0ef',
    opacity: 0.92,
    layer: 'subcortical',
    radii: [5, 5, 4],
    connected: ['putamen-{s}', 'vta', 'basal-forebrain'],
    ...ALLEN,
    ...text(
      'Ventral striatum: reward, motivation and Pavlovian–instrumental interface, heavily innervated by VTA dopamine.',
      'Implicated in addiction, depression and apathy; a target in experimental DBS.',
      'basal-ganglia',
    ),
  });

  addLR({
    id: 'stn',
    name: 'subthalamic nucleus',
    x: 10,
    y: -14,
    z: -6,
    group: 'subcortical',
    parent: 'basal-ganglia',
    meshNode: 'stn',
    colour: '#48cae4',
    opacity: 0.95,
    layer: 'subcortical',
    radius: 2.8,
    type: 'sphere',
    connected: ['gpe-{s}', 'gpi-{s}', 'sn-{s}'],
    ...ALLEN,
    ...text(
      'Glutamatergic pacemaker of the indirect pathway, sitting on the midbrain–diencephalon border.',
      'STN lesions cause hemiballismus; STN DBS is a mainstay for Parkinson motor fluctuations.',
      'basal-ganglia',
    ),
  });

  addLR({
    id: 'sn',
    name: 'substantia nigra',
    x: 10,
    y: -18,
    z: -12,
    group: 'subcortical',
    parent: 'basal-ganglia',
    meshNode: 'substantia_nigra',
    colour: '#3d348b',
    opacity: 0.95,
    layer: 'subcortical',
    radii: [4, 6, 3.5],
    connected: ['stn-{s}', 'putamen-{s}', 'vta'],
    ...ALLEN,
    ...text(
      'SNc dopaminergic neurons pigmented with neuromelanin; SNr is a GABAergic output nucleus akin to GPi.',
      'SNc degeneration is the core pathology of Parkinson disease.',
      'basal-ganglia',
    ),
  });

  addLR({
    id: 'amygdala',
    name: 'amygdala',
    x: 22,
    y: 0,
    z: -16,
    group: 'subcortical',
    parent: 'limbic',
    meshNode: 'amygdala',
    colour: '#ff6b6b',
    opacity: 0.92,
    layer: 'subcortical',
    radii: [6, 5, 5],
    connected: ['hippocampus-{s}', 'hypothalamus'],
    ...ALLEN,
    ...text(
      'Basolateral and central nuclei for threat detection, Pavlovian fear and the autonomic emotional response.',
      'Klüver–Bucy (bilateral) and Urbach–Wiethe (basolateral calcification) are classic human lesions.',
      'limbic',
    ),
  });

  addLR({
    id: 'hippocampus',
    name: 'hippocampus',
    x: 28,
    y: -20,
    z: -12,
    group: 'subcortical',
    parent: 'limbic',
    meshNode: 'hippocampus',
    colour: '#ff8fa3',
    opacity: 0.9,
    layer: 'subcortical',
    radii: [6, 16, 6],
    connected: ['fornix', 'amygdala-{s}'],
    ...ALLEN,
    ...text(
      'Allocortical memory engine (CA fields, dentate, subiculum) essential for episodic encoding and spatial maps.',
      'Mesial temporal sclerosis → temporal-lobe epilepsy; early atrophy is a hallmark of Alzheimer disease.',
      'limbic',
    ),
  });

  addLR({
    id: 'cerebellum-h',
    name: 'cerebellar hemisphere',
    x: 24,
    y: -56,
    z: -30,
    group: 'cerebellum',
    parent: null,
    meshNode: 'cerebellar_hemisphere',
    colour: '#c77dff',
    opacity: 0.5,
    layer: 'cerebellum',
    radii: [22, 16, 18],
    connected: ['vermis', 'dentate-{s}'],
    ...ALLEN,
    ...text(
      'Cerebrocerebellum: planning, timing and coordination of skilled movement via dentate → VL thalamus → cortex.',
      'Hemispheric lesions cause ipsilateral limb dysmetria, intention tremor and dysdiadochokinesia.',
      'cerebellum',
    ),
  });

  add({
    id: 'vermis',
    name: 'Cerebellar vermis',
    group: 'cerebellum',
    parent: null,
    meshNode: 'vermis',
    colour: '#e0aaff',
    opacity: 0.7,
    centroid: [0, -54, -28],
    layer: 'cerebellum',
    connected: ['cerebellum-h-lh', 'cerebellum-h-rh'],
    ...ALLEN,
    ...text(
      'Midline cerebellum for axial and gait coordination and some vestibulo-oculomotor control.',
      'Vermian lesions (medulloblastoma, alcohol) produce truncal ataxia and titubation.',
      'cerebellum',
    ),
    placeholder: { type: 'ellipsoid', center: [0, -54, -28], radii: [6, 14, 16] },
  });

  addLR({
    id: 'dentate',
    name: 'dentate nucleus',
    x: 16,
    y: -54,
    z: -30,
    group: 'cerebellum',
    parent: null,
    meshNode: 'dentate',
    colour: '#9d4edd',
    opacity: 0.95,
    layer: 'cerebellum',
    radii: [5, 6, 4],
    connected: ['cerebellum-h-{s}', 'red-nucleus-{s}'],
    ...ALLEN,
    ...text(
      'Largest deep cerebellar nucleus; output of the cerebellar hemispheres.',
      'Dentate involvement appears in some degenerative ataxias and in cerebellar outflow tremor.',
      'cerebellum',
    ),
  });

  addLR({
    id: 'lat-vent',
    name: 'lateral ventricle',
    x: 12,
    y: -8,
    z: 12,
    group: 'ventricles',
    parent: null,
    meshNode: 'lateral_ventricle',
    colour: '#4cc9f0',
    opacity: 0.5,
    layer: 'ventricles',
    radii: [6, 28, 8],
    connected: ['third-ventricle'],
    ...ALLEN,
    ...text(
      'C-shaped CSF space (frontal, body, atrium, temporal and occipital horns) lined by ependyma and containing choroid plexus.',
      'Enlarges in hydrocephalus and atrophy; temporal horns balloon early in obstructive hydrocephalus.',
      'ventricles',
    ),
  });

  add({
    id: 'third-ventricle',
    name: 'Third ventricle',
    group: 'ventricles',
    parent: null,
    meshNode: 'third_ventricle',
    colour: '#48bfe3',
    opacity: 0.55,
    centroid: [0, 0, 4],
    layer: 'ventricles',
    connected: ['lat-vent-lh', 'lat-vent-rh', 'aqueduct'],
    ...ALLEN,
    ...text(
      'Midline slit between the thalami, with choroid in the roof and the hypothalamic recesses on the floor.',
      'Colloid cysts at the foramen of Monro can cause sudden obstructive hydrocephalus.',
      'ventricles',
    ),
    placeholder: { type: 'ellipsoid', center: [0, 0, 4], radii: [2.2, 9, 8] },
  });

  add({
    id: 'aqueduct',
    name: 'Cerebral aqueduct',
    group: 'ventricles',
    parent: null,
    meshNode: 'cerebral_aqueduct',
    colour: '#56cfe1',
    opacity: 0.7,
    centroid: [0, -24, -8],
    layer: 'ventricles',
    connected: ['third-ventricle', 'fourth-ventricle'],
    ...ALLEN,
    ...text(
      'Sylvius’ aqueduct through the midbrain, linking third and fourth ventricles.',
      'Aqueductal stenosis is a classic cause of triventricular hydrocephalus.',
      'ventricles',
    ),
    placeholder: { type: 'ellipsoid', center: [0, -24, -8], radii: [1.4, 9, 1.6] },
  });

  add({
    id: 'fourth-ventricle',
    name: 'Fourth ventricle',
    group: 'ventricles',
    parent: null,
    meshNode: 'fourth_ventricle',
    colour: '#64dfdf',
    opacity: 0.55,
    centroid: [0, -40, -28],
    layer: 'ventricles',
    connected: ['aqueduct'],
    ...ALLEN,
    ...text(
      'Diamond-shaped CSF space between pons/medulla (floor) and cerebellum (roof); outlets are the foramina of Luschka and Magendie.',
      'Floor lesions produce cranial-nerve and gaze findings; obstruction → hydrocephalus.',
      'ventricles',
    ),
    placeholder: { type: 'ellipsoid', center: [0, -40, -28], radii: [5, 8, 6] },
  });

  // Vasculature
  addLR({
    id: 'ica',
    name: 'internal carotid artery',
    x: 12,
    y: 16,
    z: -22,
    group: 'vasculature',
    parent: null,
    meshNode: 'ica',
    colour: '#e63946',
    opacity: 0.95,
    layer: 'vessels',
    defaultVisible: false,
    type: 'tube',
    tubeRadius: 1.5,
    points: [[12, 18, -36], [12, 16, -24], [12, 10, -12]],
    connected: ['mca-{s}', 'aca-{s}'],
    ...PITT,
    ...text(
      'Terminal ICA in the subarachnoid space, giving rise to MCA, ACA and the posterior communicating artery.',
      'ICA stenosis and terminus aneurysms are major stroke and SAH sources.',
      'blood-supply',
    ),
  });

  addLR({
    id: 'mca',
    name: 'middle cerebral artery',
    x: 28,
    y: 8,
    z: 4,
    group: 'vasculature',
    parent: null,
    meshNode: 'mca',
    colour: '#ff4d6d',
    opacity: 0.95,
    layer: 'vessels',
    defaultVisible: false,
    type: 'tube',
    tubeRadius: 1.3,
    points: [[12, 10, -12], [22, 8, -4], [40, 6, 8], [52, 0, 16]],
    connected: ['ica-{s}'],
    ...PITT,
    ...text(
      'Sylvian artery supplying lateral convexity, basal ganglia (lenticulostriates) and the sensorimotor face/arm territories.',
      'The most common large-vessel ischaemic stroke territory.',
      'blood-supply',
    ),
  });

  addLR({
    id: 'aca',
    name: 'anterior cerebral artery',
    x: 6,
    y: 20,
    z: 10,
    group: 'vasculature',
    parent: null,
    meshNode: 'aca',
    colour: '#c9184a',
    opacity: 0.95,
    layer: 'vessels',
    defaultVisible: false,
    type: 'tube',
    tubeRadius: 1.15,
    points: [[8, 12, -10], [6, 22, 0], [6, 28, 18], [8, 8, 32]],
    connected: ['ica-{s}', 'acom'],
    ...PITT,
    ...text(
      'Runs in the interhemispheric fissure, supplying medial frontal and parietal cortex including the leg area of homunculus.',
      'ACA stroke: contralateral leg weakness, abulia and grasp phenomena.',
      'blood-supply',
    ),
  });

  add({
    id: 'acom',
    name: 'Anterior communicating artery',
    group: 'vasculature',
    parent: null,
    meshNode: 'acom',
    colour: '#ff758f',
    opacity: 0.95,
    centroid: [0, 18, -6],
    layer: 'vessels',
    defaultVisible: false,
    connected: ['aca-lh', 'aca-rh'],
    ...PITT,
    ...text(
      'Short link between the two ACAs that completes the anterior Circle of Willis.',
      'The single most common site of saccular aneurysm.',
      'blood-supply',
    ),
    placeholder: { type: 'tube', tubeRadius: 1.05, points: [[-6, 18, -6], [6, 18, -6]] },
  });

  addLR({
    id: 'pca',
    name: 'posterior cerebral artery',
    x: 16,
    y: -24,
    z: 0,
    group: 'vasculature',
    parent: null,
    meshNode: 'pca',
    colour: '#d00000',
    opacity: 0.95,
    layer: 'vessels',
    defaultVisible: false,
    type: 'tube',
    tubeRadius: 1.2,
    points: [[4, -18, -12], [12, -22, -6], [24, -36, 4], [28, -48, 12]],
    connected: ['basilar', 'pcom-{s}'],
    ...PITT,
    ...text(
      'Terminal basilar branches to occipital lobe, medial temporal lobe and (via perforators) thalamus and midbrain.',
      'PCA stroke: contralateral hemianopia, and alexia without agraphia if the splenium is included on the left.',
      'blood-supply',
    ),
  });

  addLR({
    id: 'pcom',
    name: 'posterior communicating artery',
    x: 12,
    y: 0,
    z: -10,
    group: 'vasculature',
    parent: null,
    meshNode: 'pcom',
    colour: '#ff8fa3',
    opacity: 0.95,
    layer: 'vessels',
    defaultVisible: false,
    type: 'tube',
    tubeRadius: 0.95,
    points: [[12, 8, -12], [10, -8, -10]],
    connected: ['ica-{s}', 'pca-{s}'],
    ...PITT,
    ...text(
      'Links ICA to PCA and can fetalise the posterior circulation when large.',
      'PCom aneurysms classically present with ipsilateral III palsy.',
      'blood-supply',
    ),
  });

  add({
    id: 'basilar',
    name: 'Basilar artery',
    group: 'vasculature',
    parent: null,
    meshNode: 'basilar',
    colour: '#9d0208',
    opacity: 0.95,
    centroid: [0, -24, -28],
    layer: 'vessels',
    defaultVisible: false,
    connected: ['vertebral-lh', 'vertebral-rh', 'pca-lh', 'pca-rh'],
    ...PITT,
    ...text(
      'Midline vessel formed by the vertebrals, running along the clivus/pons to bifurcate into the PCAs.',
      'Basilar occlusion can produce locked-in syndrome or coma from ARAS and corticospinal destruction.',
      'blood-supply',
    ),
    placeholder: { type: 'tube', tubeRadius: 1.6, points: [[0, -28, -46], [0, -26, -30], [0, -22, -16]] },
  });

  addLR({
    id: 'vertebral',
    name: 'vertebral artery',
    x: 6,
    y: -38,
    z: -56,
    group: 'vasculature',
    parent: null,
    meshNode: 'vertebral',
    colour: '#6a040f',
    opacity: 0.95,
    layer: 'vessels',
    defaultVisible: false,
    type: 'tube',
    tubeRadius: 1.25,
    points: [[8, -42, -68], [6, -38, -54], [2, -30, -44]],
    connected: ['basilar'],
    ...PITT,
    ...text(
      'Paired arteries that enter the foramen magnum and join to form the basilar; they give PICA.',
      'Vertebral dissection and PICA infarcts (including Wallenberg) are common posterior-circulation events.',
      'blood-supply',
    ),
  });

  add({
    id: 'sss',
    name: 'Superior sagittal sinus',
    group: 'vasculature',
    parent: null,
    meshNode: 'superior_sagittal_sinus',
    colour: '#4361ee',
    opacity: 0.85,
    centroid: [0, -10, 68],
    layer: 'vessels',
    defaultVisible: false,
    connected: ['transverse-lh', 'transverse-rh'],
    ...PITT,
    ...text(
      'Unpaired dural venous sinus in the attached edge of falx cerebri, draining convexity veins to the confluence of sinuses.',
      'CVT here causes headache, papilloedema and sometimes bilateral parasagittal infarcts or haemorrhage.',
      'blood-supply',
    ),
    placeholder: { type: 'tube', tubeRadius: 1.8, points: [[0, 50, 40], [0, 20, 72], [0, -20, 78], [0, -60, 50], [0, -72, 22]] },
  });

  addLR({
    id: 'transverse',
    name: 'transverse sinus',
    x: 28,
    y: -68,
    z: 12,
    group: 'vasculature',
    parent: null,
    meshNode: 'transverse_sinus',
    colour: '#4895ef',
    opacity: 0.85,
    layer: 'vessels',
    defaultVisible: false,
    type: 'tube',
    tubeRadius: 1.6,
    points: [[4, -72, 20], [28, -68, 12], [44, -58, 4]],
    connected: ['sss'],
    ...PITT,
    ...text(
      'Runs in the tentorium to the sigmoid sinus and jugular bulb.',
      'Often asymmetric (right-dominant); thrombosis mimics chronic headache and raised ICP.',
      'blood-supply',
    ),
  });

  // Cranial nerves
  const cn = (n, name, nucleus) => ({ number: n, name, nucleus });

  addLR({
    id: 'cn1',
    name: 'olfactory nerve (I)',
    x: 6,
    y: 42,
    z: -20,
    group: 'cranial-nerves',
    parent: null,
    meshNode: 'cn1',
    colour: '#adb5bd',
    opacity: 0.95,
    layer: 'nerves',
    defaultVisible: false,
    type: 'tube',
    tubeRadius: 0.9,
    points: [[8, 52, -18], [6, 40, -22], [8, 28, -18]],
    cn: cn(1, 'Olfactory', 'Olfactory bulb (telencephalic, not a true brainstem nerve)'),
    connected: ['olf-epithelium-{s}'],
    ...PITT,
    ...text(
      'Fila olfactoria through the cribriform plate to the olfactory bulb and tract. Special visceral afferent for smell.',
      'Anosmia after trauma or meningioma of the olfactory groove; uncinate seizures produce olfactory auras.',
      'cranial-nerves',
    ),
  });

  addLR({
    id: 'olfactory-tract',
    name: 'olfactory tract',
    x: 14,
    y: 34,
    z: -20,
    group: 'cranial-nerves',
    parent: null,
    meshNode: 'olfactory_tract',
    colour: '#9b8cff',
    opacity: 0.95,
    layer: 'nerves',
    defaultVisible: true,
    showWith: ['sensory'],
    type: 'tube',
    tubeRadius: 1.1,
    pointsL: [[-7, 40, -25.5], [-8, 38, -24], [-16, 32, -20], [-23, 28, -15]],
    pointsR: [[7, 40, -25.5], [9, 38, -24], [18, 32, -18], [28, 27, -11]],
    connected: ['olf-epithelium-{s}', 'amygdala-{s}'],
    ...SCH,
    ...text(
      'Schematic course from the olfactory epithelium, through the cribriform region, then posteriorly along the orbital frontal lobe toward piriform cortex and the amygdala.',
      'Anosmia after trauma or an olfactory-groove meningioma; uncinate seizures produce olfactory auras.',
      'cranial-nerves',
    ),
  });

  addLR({
    id: 'cn2',
    name: 'optic nerve (II)',
    x: 18,
    y: 40,
    z: -12,
    group: 'cranial-nerves',
    parent: null,
    meshNode: 'cn2',
    colour: '#ffd166',
    opacity: 0.95,
    layer: 'nerves',
    defaultVisible: true,
    showWith: ['sensory'],
    type: 'tube',
    tubeRadius: 1.8,
    pointsL: [[-34, 56, -36], [-30, 52, -30], [-18, 49, -22], [-8, 46, -17], [-2, 44, -15]],
    pointsR: [[34, 56, -36], [30, 52, -30], [18, 49, -22], [10, 46, -17], [6, 44, -15]],
    cn: cn(2, 'Optic', 'Retinal ganglion cells → LGN (not a brainstem nucleus)'),
    connected: ['eye-{s}', 'optic-chiasm', 'optic-tract-{s}', 'lgn-{s}'],
    ...PITT,
    ...text(
      'CNS tract from globe through the optic canal to the chiasm. Myelinated by oligodendrocytes.',
      'Papilloedema, optic neuritis and field cuts are localised by the classic chiasmal rules.',
      'cranial-nerves',
    ),
  });

  addLR({
    id: 'cn3',
    name: 'oculomotor nerve (III)',
    x: 6,
    y: 20,
    z: -14,
    group: 'cranial-nerves',
    parent: null,
    meshNode: 'cn3',
    colour: '#f4a261',
    opacity: 0.95,
    layer: 'nerves',
    defaultVisible: false,
    type: 'tube',
    tubeRadius: 0.85,
    points: [[4, -16, -10], [8, 8, -16], [22, 48, -10]],
    cn: cn(3, 'Oculomotor', 'Oculomotor nucleus and Edinger–Westphal, midbrain tegmentum'),
    connected: ['midbrain', 'eye-{s}'],
    ...PITT,
    ...text(
      'Innervates MR, SR, IR, IO and levator; parasympathetic pupilloconstrictor fibres ride on its surface.',
      'A “down and out” eye with ptosis and a blown pupil suggests a compressive III (PCom aneurysm, herniation).',
      'cranial-nerves',
    ),
  });

  addLR({
    id: 'cn5',
    name: 'trigeminal nerve (V)',
    x: 18,
    y: -10,
    z: -22,
    group: 'cranial-nerves',
    parent: null,
    meshNode: 'cn5',
    colour: '#e9c46a',
    opacity: 0.95,
    layer: 'nerves',
    defaultVisible: false,
    type: 'tube',
    tubeRadius: 1.2,
    points: [[8, -26, -24], [18, -12, -22], [36, 8, -18]],
    cn: cn(5, 'Trigeminal', 'Principal, mesencephalic, spinal V and motor V nuclei'),
    connected: ['pons'],
    ...PITT,
    ...text(
      'Great sensory nerve of the face plus muscles of mastication. Three divisions: V1, V2, V3.',
      'Trigeminal neuralgia (often vascular compression at the REZ) and herpes zoster ophthalmicus are common.',
      'cranial-nerves',
    ),
  });

  addLR({
    id: 'cn7',
    name: 'facial nerve (VII)',
    x: 20,
    y: -22,
    z: -28,
    group: 'cranial-nerves',
    parent: null,
    meshNode: 'cn7',
    colour: '#f4d35e',
    opacity: 0.95,
    layer: 'nerves',
    defaultVisible: false,
    type: 'tube',
    tubeRadius: 0.8,
    points: [[10, -30, -28], [20, -22, -30], [36, -8, -26]],
    cn: cn(7, 'Facial', 'Facial nucleus (pontine tegmentum) and superior salivatory nucleus'),
    connected: ['pons'],
    ...PITT,
    ...text(
      'Muscles of facial expression, taste from the anterior two-thirds of the tongue, and several parasympathetic secretomotor fibres.',
      'LMN VII (Bell) vs UMN (forehead sparing) is a core localisation drill. CPA tumours can involve VII with VIII.',
      'cranial-nerves',
    ),
  });

  addLR({
    id: 'cn8',
    name: 'vestibulocochlear nerve (VIII)',
    x: 22,
    y: -26,
    z: -30,
    group: 'cranial-nerves',
    parent: null,
    meshNode: 'cn8',
    colour: '#ee9b00',
    opacity: 0.95,
    layer: 'nerves',
    defaultVisible: true,
    showWith: ['sensory'],
    type: 'tube',
    tubeRadius: 1.15,
    pointsL: [[-43, -22, -33], [-32, -18, -30], [-24, -14, -28], [-17, -12, -26]],
    pointsR: [[43, -22, -33], [32, -18, -30], [26, -14, -28], [24, -12, -26]],
    cn: cn(8, 'Vestibulocochlear', 'Cochlear and vestibular nuclei at the pontomedullary junction'),
    connected: ['pons', 'cochlea-{s}', 'scc-{s}'],
    ...PITT,
    ...text(
      'Special somatic afferent for hearing and balance, from cochlea and labyrinth through the IAM to the CPA.',
      'Vestibular schwannoma: progressive unilateral hearing loss, tinnitus and later V/VII involvement.',
      'cranial-nerves',
    ),
  });

  addLR({
    id: 'cn10',
    name: 'vagus nerve (X)',
    x: 8,
    y: -36,
    z: -52,
    group: 'cranial-nerves',
    parent: null,
    meshNode: 'cn10',
    colour: '#ca6702',
    opacity: 0.95,
    layer: 'nerves',
    defaultVisible: false,
    type: 'tube',
    tubeRadius: 0.8,
    points: [[6, -38, -46], [8, -40, -58], [10, -36, -78]],
    cn: cn(10, 'Vagus', 'Nucleus ambiguus and dorsal motor nucleus of X, medulla'),
    connected: ['medulla'],
    ...PITT,
    ...text(
      'The wanderer: palate, pharynx, larynx, and parasympathetic supply to thoracic and abdominal viscera.',
      'Unilateral X: hoarseness and palatal droop; bilateral lesions threaten the airway and autonomic control.',
      'cranial-nerves',
    ),
  });

  // ARAS
  addLR({
    id: 'lc',
    name: 'locus coeruleus (NE)',
    x: 4,
    y: -37,
    z: -26,
    group: 'aras',
    parent: null,
    meshNode: 'locus_coeruleus',
    colour: '#3a86ff',
    opacity: 0.95,
    layer: 'aras',
    radius: 2.2,
    type: 'sphere',
    transmitter: 'NE',
    connected: ['pno', 'iln-lh', 'iln-rh'],
    ...AAN,
    ...text(
      'Pontine noradrenergic nucleus that broadcasts novelty, stress and gain control across cortex and thalamus.',
      'LC degeneration is early in Alzheimer and Parkinson disease and is linked to arousal and autonomic instability.',
      'aras',
    ),
  });

  add({
    id: 'dr',
    name: 'Dorsal raphe (5-HT)',
    group: 'aras',
    parent: null,
    meshNode: 'dorsal_raphe',
    colour: '#8338ec',
    opacity: 0.95,
    centroid: [0, -28, -10],
    layer: 'aras',
    transmitter: '5-HT',
    connected: ['mr', 'pag'],
    ...AAN,
    ...text(
      'Midline serotonergic cell group in the ventral PAG / dorsal midbrain, modulating mood, sleep and pain.',
      'A target of SSRIs; midbrain haemorrhage can injure this cluster with the PAG.',
      'aras',
    ),
    placeholder: { type: 'sphere', center: [0, -28, -10], radius: 2.4 },
  });

  add({
    id: 'mr',
    name: 'Median raphe (5-HT)',
    group: 'aras',
    parent: null,
    meshNode: 'median_raphe',
    colour: '#9b5de5',
    opacity: 0.95,
    centroid: [0, -26, -20],
    layer: 'aras',
    transmitter: '5-HT',
    connected: ['dr', 'pno'],
    ...AAN,
    ...text(
      'More caudal serotonergic raphe projecting heavily to hippocampus and cortex; part of the ventral arousal stream.',
      'Together with the dorsal raphe it sets a serotonergic tone implicated in anxiety and sleep architecture.',
      'aras',
    ),
    placeholder: { type: 'sphere', center: [0, -26, -20], radius: 2.2 },
  });

  add({
    id: 'pag',
    name: 'Periaqueductal grey',
    group: 'aras',
    parent: null,
    meshNode: 'pag',
    colour: '#fb5607',
    opacity: 0.88,
    centroid: [0, -29, -8],
    layer: 'aras',
    connected: ['dr', 'ppn-lh', 'ppn-rh', 'iln-lh', 'iln-rh'],
    ...AAN,
    ...text(
      'Grey matter around the aqueduct: defensive behaviour, descending pain control, and a hub of the dorsal arousal path.',
      'PAG lesions (and stimulation) alter pain, autonomic state and, in some reports, consciousness.',
      'aras',
    ),
    placeholder: { type: 'ellipsoid', center: [0, -29, -8], radii: [4.5, 6, 5] },
  });

  addLR({
    id: 'pbn',
    name: 'parabrachial complex',
    x: 8,
    y: -35,
    z: -26,
    group: 'aras',
    parent: null,
    meshNode: 'parabrachial',
    colour: '#ff006e',
    opacity: 0.95,
    layer: 'aras',
    radius: 2.3,
    type: 'sphere',
    connected: ['lc-{s}', 'pno'],
    ...AAN,
    ...text(
      'Pontine relay for visceral, taste and interoceptive afferents; a recently emphasised node for arousal and affective state.',
      'PBN injury is discussed in coma and in the affective dimension of pain.',
      'aras',
    ),
  });

  addLR({
    id: 'ppn',
    name: 'pedunculopontine tegmental nucleus (ACh)',
    x: 6,
    y: -26,
    z: -12,
    group: 'aras',
    parent: null,
    meshNode: 'ppn',
    colour: '#06d6a0',
    opacity: 0.95,
    layer: 'aras',
    radius: 2.4,
    type: 'sphere',
    transmitter: 'ACh',
    connected: ['ldtg-{s}', 'pag', 'iln-{s}'],
    ...AAN,
    ...text(
      'Cholinergic mesopontine nucleus (PPT / PTg) projecting to thalamus — a pillar of the dorsal ARAS route and of gait/locomotor pattern generation.',
      'PPN DBS has been tried for Parkinsonian gait freezing; degeneration occurs in progressive supranuclear palsy.',
      'aras',
    ),
  });

  addLR({
    id: 'ldtg',
    name: 'laterodorsal tegmental nucleus (ACh)',
    x: 4,
    y: -30,
    z: -20,
    group: 'aras',
    parent: null,
    meshNode: 'ldtg',
    colour: '#0ead69',
    opacity: 0.95,
    layer: 'aras',
    radius: 2.1,
    type: 'sphere',
    transmitter: 'ACh',
    connected: ['ppn-{s}', 'pno'],
    ...AAN,
    ...text(
      'Sister cholinergic cell group to PPN, contributing ACh to thalamus and to REM-on networks.',
      'Part of the mesopontine cholinergic system that fragments in synucleinopathies.',
      'aras',
    ),
  });

  add({
    id: 'mrf',
    name: 'Mesencephalic reticular formation',
    group: 'aras',
    parent: null,
    meshNode: 'mrf',
    colour: '#ffbe0b',
    opacity: 0.85,
    centroid: [0, -22, -8],
    layer: 'aras',
    connected: ['pag', 'pno', 'vta'],
    ...AAN,
    ...text(
      'Core midbrain reticular field that integrates ascending sensory drive and projects to intralaminar thalamus.',
      'A strategic lesion here (or in both paramedian thalami) is a classic cause of coma.',
      'aras',
    ),
    placeholder: { type: 'ellipsoid', center: [0, -22, -8], radii: [6, 6, 5] },
  });

  add({
    id: 'pno',
    name: 'Nucleus pontis oralis',
    group: 'aras',
    parent: null,
    meshNode: 'pontis_oralis',
    colour: '#fb8500',
    opacity: 0.9,
    centroid: [0, -28, -20],
    layer: 'aras',
    connected: ['mrf', 'lc-lh', 'lc-rh', 'mr'],
    ...AAN,
    ...text(
      'Rostral pontine reticular nucleus on both the ascending arousal path and descending locomotor/REM circuits.',
      'Pontine tegmental lesions that include PnO can abolish REM sleep and impair arousal.',
      'aras',
    ),
    placeholder: { type: 'ellipsoid', center: [0, -28, -20], radii: [5.5, 5, 4] },
  });

  add({
    id: 'vta',
    name: 'Ventral tegmental area (DA)',
    group: 'aras',
    parent: null,
    meshNode: 'vta',
    colour: '#ff5400',
    opacity: 0.95,
    centroid: [0, -16, -12],
    layer: 'aras',
    transmitter: 'DA',
    connected: ['sn-lh', 'sn-rh', 'nac-lh', 'nac-rh', 'hypothalamus'],
    ...AAN,
    ...text(
      'Midbrain dopamine neurons projecting to nucleus accumbens, prefrontal cortex and amygdala — motivation and the ventral arousal stream.',
      'Drugs of abuse converge on VTA→NAc; VTA lesions blunt reward seeking.',
      'aras',
    ),
    placeholder: { type: 'sphere', center: [0, -16, -12], radius: 2.8 },
  });

  // Sensory schematics
  addLR({
    id: 'eye',
    name: 'eyeball',
    x: 32,
    y: 64,
    z: -8,
    group: 'sensory',
    parent: null,
    meshNode: 'eye',
    colour: '#ade8f4',
    opacity: 0.7,
    layer: 'sensory',
    defaultVisible: false,
    radius: 12,
    type: 'sphere',
    connected: ['lens-{s}', 'cn2-{s}'],
    ...SCH,
    ...text(
      'Schematic globe at a roughly MNI-consistent orbit. Real extraocular muscles are not modelled.',
      'Orbit pathology is not the focus of this page; use it as a landmark for CN II / III.',
      'cranial-nerves',
    ),
  });

  addLR({
    id: 'lens',
    name: 'lens (schematic)',
    x: 32,
    y: 70,
    z: -8,
    group: 'sensory',
    parent: null,
    meshNode: 'lens',
    colour: '#caf0f8',
    opacity: 0.85,
    layer: 'sensory',
    defaultVisible: false,
    radii: [4, 2.2, 4],
    connected: ['eye-{s}'],
    ...SCH,
    ...text(
      'Schematic lens sitting in the anterior globe.',
      'Cataract and accommodation are outside the scope of this neuroanatomy page.',
      'cranial-nerves',
    ),
  });

  addLR({
    id: 'cochlea',
    name: 'cochlea (schematic)',
    x: 48,
    y: -20,
    z: -32,
    group: 'sensory',
    parent: null,
    meshNode: 'cochlea',
    colour: '#ffc6ff',
    opacity: 0.95,
    layer: 'sensory',
    defaultVisible: false,
    type: 'spiral',
    radius: 5,
    tubeRadius: 0.85,
    turns: 2.6,
    height: 6,
    connected: ['cn8-{s}', 'scc-{s}'],
    ...SCH,
    ...text(
      'Schematic spiral of Corti — not a segmented temporal-bone reconstruction.',
      'Sensorineural hearing loss localises to hair cells, spiral ganglion or CN VIII.',
      'cranial-nerves',
    ),
  });

  addLR({
    id: 'scc',
    name: 'semicircular canals (schematic)',
    x: 50,
    y: -16,
    z: -28,
    group: 'sensory',
    parent: null,
    meshNode: 'scc',
    colour: '#e0aaff',
    opacity: 0.9,
    layer: 'sensory',
    defaultVisible: false,
    type: 'canals',
    radius: 5.5,
    tubeRadius: 0.55,
    connected: ['cochlea-{s}', 'cn8-{s}'],
    ...SCH,
    ...text(
      'Three schematic rings (horizontal, anterior, posterior) standing in for the bony labyrinth.',
      'Canal paresis and BPPV are localised here; this geometry is labelled schematic, not a CT segmentation.',
      'cranial-nerves',
    ),
  });

  addLR({
    id: 'olf-epithelium',
    name: 'olfactory epithelium (schematic)',
    x: 8,
    y: 54,
    z: -22,
    group: 'sensory',
    parent: null,
    meshNode: 'olfactory_epithelium',
    colour: '#b8c0ff',
    opacity: 0.8,
    layer: 'sensory',
    defaultVisible: false,
    radii: [5, 8, 2.5],
    connected: ['cn1-{s}'],
    ...SCH,
    ...text(
      'Schematic patch on the cribriform region where olfactory receptor neurons sit.',
      'Viral and traumatic anosmia often begin at this epithelium or the fila through the cribriform plate.',
      'cranial-nerves',
    ),
  });

  add({
    id: 'section-midbrain',
    name: 'Midbrain axial section',
    group: 'slices',
    parent: null,
    meshNode: 'section_midbrain',
    colour: '#e07a5f',
    opacity: 0.85,
    centroid: [0, -24, -8],
    layer: 'slices',
    kind: 'section',
    defaultVisible: false,
    connected: ['midbrain'],
    ...PITT,
    ...text(
      'Placeholder for a PittBrains3D midbrain axial plate (colliculi, PAG, red nucleus, SN, peduncles).',
      'Use the slice presets to clip the solid brainstem at this level when the real plate is not loaded.',
      'midbrain',
    ),
    placeholder: { type: 'disc', center: [0, -24, -8], radius: 18, plane: 'axial', thickness: 1.6 },
  });

  add({
    id: 'section-pons',
    name: 'Pontine axial section',
    group: 'slices',
    parent: null,
    meshNode: 'section_pons',
    colour: '#c26d5a',
    opacity: 0.85,
    centroid: [0, -28, -24],
    layer: 'slices',
    kind: 'section',
    defaultVisible: false,
    connected: ['pons'],
    ...PITT,
    ...text(
      'Placeholder for a pontine axial plate (basilar pons, tegmentum, CN nuclei, fourth-ventricle floor).',
      'Exploded view fans the plates apart along the brainstem axis.',
      'brainstem',
    ),
    placeholder: { type: 'disc', center: [0, -28, -24], radius: 20, plane: 'axial', thickness: 1.6 },
  });

  add({
    id: 'section-medulla-rostral',
    name: 'Rostral medulla axial section',
    group: 'slices',
    parent: null,
    meshNode: 'section_medulla_rostral',
    colour: '#9b4d4d',
    opacity: 0.85,
    centroid: [0, -36, -38],
    layer: 'slices',
    kind: 'section',
    defaultVisible: false,
    connected: ['medulla'],
    ...PITT,
    ...text(
      'Placeholder for a rostral medullary plate (olives, inferior cerebellar peduncles, hypoglossal eminence).',
      'Compare with the caudal plate to see the opening of the fourth ventricle.',
      'brainstem',
    ),
    placeholder: { type: 'disc', center: [0, -36, -38], radius: 14, plane: 'axial', thickness: 1.6 },
  });

  add({
    id: 'section-medulla-caudal',
    name: 'Caudal medulla axial section',
    group: 'slices',
    parent: null,
    meshNode: 'section_medulla_caudal',
    colour: '#7f3b3b',
    opacity: 0.85,
    centroid: [0, -38, -48],
    layer: 'slices',
    kind: 'section',
    defaultVisible: false,
    connected: ['medulla', 'pyramid-lh', 'pyramid-rh'],
    ...PITT,
    ...text(
      'Placeholder for a caudal medullary plate (pyramids, medial lemniscus, decussation approaching).',
      'This is the level of several medial vs lateral medullary stroke cartoons.',
      'brainstem',
    ),
    placeholder: { type: 'disc', center: [0, -38, -48], radius: 12, plane: 'axial', thickness: 1.6 },
  });

  return {
    version: 1,
    space: 'MNI152',
    units: 'mm',
    axes: 'RAS+',
    sceneMapping: 'three.js world = (x, z, -y)',
    origin: 'anterior commissure',
    placeholder: true,
    groups: [
      { id: 'head', name: 'Head and scalp', asset: 'assets/head.glb', layer: 'head', defaultVisible: true, renderOrder: 8 },
      { id: 'core', name: 'Cortex and brainstem', asset: 'assets/core.glb', layer: 'cortex', defaultVisible: true, renderOrder: 8 },
      { id: 'white-matter', name: 'White matter', asset: 'assets/white-matter.glb', layer: 'white-matter', defaultVisible: true, renderOrder: 12 },
      { id: 'subcortical', name: 'Subcortical nuclei', asset: 'assets/subcortical.glb', layer: 'subcortical', defaultVisible: true, renderOrder: 18 },
      { id: 'cerebellum', name: 'Cerebellum', asset: 'assets/cerebellum.glb', layer: 'cerebellum', defaultVisible: true, renderOrder: 10 },
      { id: 'ventricles', name: 'Ventricles', asset: 'assets/ventricles.glb', layer: 'ventricles', defaultVisible: true, renderOrder: 22 },
      { id: 'vasculature', name: 'Vasculature', asset: 'assets/vasculature.glb', layer: 'vessels', defaultVisible: false, renderOrder: 28 },
      { id: 'cranial-nerves', name: 'Cranial nerves', asset: 'assets/cranial-nerves.glb', layer: 'nerves', defaultVisible: false, renderOrder: 30 },
      { id: 'aras', name: 'Ascending arousal network', asset: 'assets/aras.glb', layer: 'aras', defaultVisible: true, renderOrder: 32 },
      { id: 'sensory', name: 'Sensory organs', asset: 'assets/sensory.glb', layer: 'sensory', defaultVisible: false, renderOrder: 26 },
      { id: 'slices', name: 'Brainstem axial sections', asset: 'assets/slices.glb', layer: 'slices', defaultVisible: false, renderOrder: 24 },
    ],
    fiducials: [
      { id: 'nasion', name: 'Nasion', mni: [0, 85, -30] },
      { id: 'lpa', name: 'Left pre-auricular (LPA)', mni: [-80, 0, -30] },
      { id: 'rpa', name: 'Right pre-auricular (RPA)', mni: [80, 0, -30] },
      { id: 'cz', name: 'Cz', mni: [0, -20, 95] },
    ],
    slicePresets: [
      { id: 'midbrain-sc', name: 'Midbrain · superior colliculus', plane: 'axial', value: -2 },
      { id: 'midbrain-ic', name: 'Midbrain · inferior colliculus', plane: 'axial', value: -8 },
      { id: 'pons', name: 'Pons', plane: 'axial', value: -24 },
      { id: 'medulla-rostral', name: 'Rostral medulla', plane: 'axial', value: -38 },
      { id: 'medulla-caudal', name: 'Caudal medulla', plane: 'axial', value: -48 },
      { id: 'ac-pc', name: 'AC–PC (axial 0)', plane: 'axial', value: 0 },
      { id: 'mid-sagittal', name: 'Midsagittal', plane: 'sagittal', value: 0 },
    ],
    structures,
    credits: {
      title: 'Sources and licences',
      disclaimer: 'Positions are template-based (MNI152) and many meshes in this build are schematic placeholders. Vessels, nerves and nuclei from different donors will not sit in a single true anatomy. Do not use this page for clinical localisation.',
      items: [
        { name: 'Allen Human Reference Atlas 3D via Human Reference Atlas', licence: 'CC BY 4.0', note: 'Cortical, subcortical, ventricular, cerebellar and brainstem backbone.' },
        { name: 'PittBrains3D', licence: 'CC BY-SA 4.0', note: 'Cranial nerves, cerebral vessels, dural sinuses and brainstem axial sections. Share-alike applies to derived meshes.' },
        { name: 'Harvard Ascending Arousal Network Atlas v2.0', licence: 'CC0', note: 'AAN nuclei (LC, raphe, PAG, PBN, PPN, LDTg, MRF, PnO, VTA).' },
        { name: 'BodyParts3D', licence: 'CC BY-SA 2.1 JP', note: 'Gap-fillers such as pituitary, pineal and inferior colliculus when present.' },
        { name: 'fsaverage head / 10–20 fiducials', licence: 'Check MNE/FreeSurfer terms', note: 'Translucent scalp context and nasion / LPA / RPA / Cz.' },
        { name: 'Procedural sensory organs', licence: 'CC BY 4.0', note: 'Eyeball, lens, cochlea, semicircular canals and olfactory epithelium when no open mesh exists. Always labelled schematic.' },
      ],
    },
  };
}
