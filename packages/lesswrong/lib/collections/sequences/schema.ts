import { schemaDefaultValue, foreignKeyField, accessFilterSingle, accessFilterMultiple, resolverOnlyField } from '../../utils/schemaUtils';
import { getWithCustomLoader } from '../../loaders';
import { isFriendlyUI } from '../../../themes/forumTheme';
import { userOwns } from '../../vulcan-users';

const formGroups: Partial<Record<string, FormGroupType<"Sequences">>> = {
  advancedOptions: {
    name: "advancedOptions",
    order: 2,
    label: isFriendlyUI ? "Advanced options" : "Advanced Options",
    startCollapsed: true,
  },
};

const schema: SchemaType<"Sequences"> = {
  userId: {
    ...foreignKeyField({
      idFieldName: "userId",
      resolverName: "user",
      collectionName: "Users",
      type: "User",
      nullable: true,
    }),
    optional: true,
    nullable: false,
    canRead: ['guests'],
    canCreate: ['admins'],
    canUpdate: ['admins'],
    control: 'FormUserSelect',
    tooltip: 'The user id of the author',
  },

  title: {
    type: String,
    optional: false,
    canRead: ['guests'],
    canUpdate: [userOwns, 'admins', 'sunshineRegiment'],
    canCreate: ['members'],
    order: 10,
    placeholder: "Sequence Title",
    control: 'EditSequenceTitle',
  },

  // This resolver isn't used within LessWrong AFAICT, but is used by an external API user
  chaptersDummy: {
    type: Array,
    optional: true,
    canRead: ['guests'],
    resolveAs: {
      fieldName: 'chapters',
      type: '[Chapter]',
      resolver: async (sequence: DbSequence, args: void, context: ResolverContext): Promise<Partial<DbChapter>[]> => {
        const chapters = await context.Chapters.find(
          {sequenceId: sequence._id},
          {sort: {number: 1}},
        ).fetch();
        return await accessFilterMultiple(context.currentUser, context.Chapters, chapters, context);
      }
    }
  },

  'chaptersDummy.$': {
    type: String,
    foreignKey: "Chapters",
    optional: true,
  },
  
  //Cloudinary image id for the grid Image
  gridImageId: {
    type: String,
    optional: true,
    order:25,
    canRead: ['guests'],
    canUpdate: [userOwns, 'admins', 'sunshineRegiment'],
    canCreate: ['members'],
    control: "ImageUpload",
    label: "Card Image"
  },

  //Cloudinary image id for the banner image (high resolution)
  bannerImageId: {
    type: String,
    optional: true,
    canRead: ['guests'],
    canUpdate: [userOwns, 'admins', 'sunshineRegiment'],
    canCreate: ['members'],
    label: "Banner Image",
    control: "ImageUpload",
  },

  curatedOrder: {
    type: Number,
    optional: true,
    canRead: ['guests'],
    canUpdate: ['admins'],
    canCreate: ['admins'],
  },

  userProfileOrder: {
    type: Number,
    optional: true,
    canRead: ['guests'],
    canUpdate: ['admins', 'sunshineRegiment'],
    canCreate: ['admins', 'sunshineRegiment'],
  },
  
  hideFromAuthorPage: {
    type: Boolean,
    optional: true,
    canRead: ['guests'],
    canUpdate: [userOwns, 'admins', 'sunshineRegiment'],
    canCreate: ['members'],
    label: "Hide from my user profile",
    ...schemaDefaultValue(false),
  },

  draft: {
    type: Boolean,
    optional: true,
    canRead: ['guests'],
    canUpdate: [userOwns, 'admins', 'sunshineRegiment'],
    canCreate: ['members'],
    control: "checkbox",
    ...schemaDefaultValue(false),
  },

  isDeleted: {
    type: Boolean,
    optional: true,
    canRead: ['guests'],
    canUpdate: [userOwns, 'admins', 'sunshineRegiment'],
    canCreate: ['members'],
    group: formGroups.advancedOptions,
    label: "Delete",
    tooltip: "Make sure you want to delete this sequence - it will be completely hidden from the forum.",
    control: "checkbox",
    ...schemaDefaultValue(false),
  },

  canonicalCollectionSlug: {
    type: String,
    foreignKey: {
      collection: "Collections",
      field: "slug",
    },
    optional: true,
    canRead: ['guests'],
    canUpdate: ['admins'],
    canCreate: ['admins'],
    hidden: false,
    control: "text",
    order: 30,
    label: "Collection Slug",
    tooltip: "The machine-readable slug for the collection this sequence belongs to. Will affect links, so don't set it unless you have the slug exactly right.",
    resolveAs: {
      fieldName: 'canonicalCollection',
      addOriginalField: true,
      type: "Collection",
      // TODO: Make sure we run proper access checks on this. Using slugs means it doesn't
      // work out of the box with the id-resolver generators
      resolver: async (sequence: DbSequence, args: void, context: ResolverContext): Promise<Partial<DbCollection>|null> => {
        if (!sequence.canonicalCollectionSlug) return null;
        const collection = await context.Collections.findOne({slug: sequence.canonicalCollectionSlug})
        return await accessFilterSingle(context.currentUser, context.Collections, collection, context);
      }
    }
  },

  hidden: {
    type: Boolean,
    optional: true,
    canRead: ['guests'],
    canUpdate: ['admins', 'sunshineRegiment'],
    canCreate: ['admins', 'sunshineRegiment'],
    ...schemaDefaultValue(false),
  },

  noindex: {
    type: Boolean,
    optional: true,
    canRead: ['guests'],
    canCreate: ['admins', 'sunshineRegiment'],
    canUpdate: ['admins', 'sunshineRegiment'],
    ...schemaDefaultValue(false),
  },

  postsCount: resolverOnlyField({
    type: Number,
    graphQLtype: 'Int!',
    canRead: ['guests'],
    resolver: async (sequence: DbSequence, args: void, context: ResolverContext) => {
      const count = await getWithCustomLoader<number, string>(
        context,
        "sequencePostsCount",
        sequence._id,
        (sequenceIds): Promise<number[]> => {
          return context.repos.sequences.postsCount(sequenceIds);
        }
      );

      return count;
    }
  }),

  readPostsCount: resolverOnlyField({
    type: Number,
    graphQLtype: 'Int!',
    canRead: ['guests'],
    resolver: async (sequence: DbSequence, args: void, context: ResolverContext) => {
      const currentUser = context.currentUser;
      
      if (!currentUser) return 0;

      const createCompositeId = (sequenceId: string, userId: string) => `${sequenceId}-${userId}`;
      const splitCompositeId = (compositeId: string) => {
        const [sequenceId, userId] = compositeId.split('-')
        return {sequenceId, userId};
      };

      const count = await getWithCustomLoader<number, string>(
        context,
        "sequenceReadPostsCount",
        createCompositeId(sequence._id, currentUser._id),
        (compositeIds): Promise<number[]> => {
          return context.repos.sequences.readPostsCount(compositeIds.map(splitCompositeId));
        }
      );

      return count;
    }
  }),

  /* Alignment Forum fields */

  af: {
    type: Boolean,
    optional: true,
    nullable: false,
    label: "Alignment Forum",
    ...schemaDefaultValue(false),
    canRead: ['guests'],
    canUpdate: ['alignmentVoters'],
    canCreate: ['alignmentVoters'],
  },
};

export default schema;
