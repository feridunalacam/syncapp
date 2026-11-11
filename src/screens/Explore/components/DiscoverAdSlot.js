import React from 'react';
import AdBanner from '../../../components/ads/AdBanner';

// The only banner placement: a labelled Discover header, outside the feed.
export default function DiscoverAdSlot({ visible = true, hasBlockingModal = false }) {
  return <AdBanner placementVisible={visible} hasBlockingModal={hasBlockingModal} />;
}
